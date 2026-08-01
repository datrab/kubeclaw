import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { lifecycleNotification, previewNotification } = await import(pathToFileURL(path.resolve('src/observer.ts')).href);
const base = {
  event: {
    eventId: 'event:1', type: 'run.failed', identity: { runId: 'run:1', stageId: 'stage:1' },
    payload: { message: 'failed because tests failed' },
  },
};
assert.deepEqual(lifecycleNotification(base), {
  type: 'run.failed', eventId: 'event:1', runId: 'run:1', stageId: 'stage:1',
  severity: 'error', title: 'Pipeline run failed',
  summary: 'failed because tests failed',
  reasonCode: null,
  fields: [
    { name: 'Run ID', value: 'run:1', inline: false },
    { name: 'Stage', value: 'stage:1', inline: true },
  ],
  footer: 'KubeClaw Pipeline · run:1',
});
const preview = previewNotification({
  event: {
    eventId: 'event:2', type: 'artifact.created',
    identity: { runId: 'run:1', artifactId: 'artifact:1' },
    payload: { artifact: { artifactId: 'artifact:1', digest: 'sha256:abc', mediaType: 'text/html', secret: 'do-not-forward' } },
  },
});
assert.equal(preview.artifact.digest, 'sha256:abc');
assert.equal(preview.artifact.secret, undefined);
assert.doesNotMatch(JSON.stringify(preview), /do-not-forward/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.notification-observer', suite: 'observer-unit' }));
