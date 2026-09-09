import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { artifactFromWrite, ArtifactCheckpointRecorder } from '../../../skills/nova/core/execution/artifact-checkpoints.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';

const attempt = { runId: 'review:run', stageId: 'review', attemptId: 'review:attempt', attemptNumber: 1 };

async function fixture(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-checkpoint-'));
  const adapter = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
  await adapter.ready();
  const request = { operation: 'put_json', capability: 'artifacts.write',
    resource: { type: 'artifact.object', canonicalId: 'review:artifact' },
    payload: { checkpoint: true, namespace: 'test.review', mediaType: 'application/json',
      encoding: PORTABLE_JSON_ENCODING, value: { z: 1, ä: 2 } },
    attempt, idempotencyKey: 'review:write' };
  try {
    const response = await adapter.invoke({ confidential: true, signal: new AbortController().signal, request });
    await body({ root, request, response, artifact: response.artifact });
  } finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
}

function appendTo(journal) {
  return (type, identity, payload, causationId = attempt.attemptId) => {
    let event;
    journal.appendSequenced(sequence => event = { schemaVersion: 'lifecycle-event.v2',
      eventId: `review:${sequence}`, sequence, type, identity, payload, causationId,
      occurredAt: '2026-09-09T00:00:00.000Z' });
    return event;
  };
}

test('independent genuine-store response still binds all owner and byte fields', async () => {
  await fixture(async ({ request, response, artifact }) => {
    assert.deepEqual(artifactFromWrite(attempt, request, response), artifact);
    for (const changed of [
      { artifactId: 'foreign' }, { namespace: 'foreign' }, { mediaType: 'text/plain' },
      { digest: `sha256:${'0'.repeat(64)}` }, { sizeBytes: artifact.sizeBytes + 1 },
      { producer: { ...attempt, runId: 'foreign' } }, { producer: { ...attempt, stageId: 'foreign' } },
      { producer: { ...attempt, attemptId: 'foreign' } }, { producer: { ...attempt, attemptNumber: 2 } },
      { encoding: 'future-codec' },
    ]) assert.throws(() => artifactFromWrite(attempt, request, { artifact: { ...artifact, ...changed } }), /ARTIFACT_CHECKPOINT_(RESPONSE|PRODUCER)_INVALID/);
  });
});

test('independent completion-before-projection recovery preserves the portable original reference', async () => {
  await fixture(async ({ root, artifact }) => {
    const file = path.join(root, 'events.jsonl');
    const journal = new FileJournal(file);
    appendTo(journal)('attempt.completed', { runId: attempt.runId, stageId: attempt.stageId },
      { result: { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] } });
    const recoveredJournal = new FileJournal(file);
    const recovered = new ArtifactCheckpointRecorder(recoveredJournal, appendTo(recoveredJournal));
    assert.deepEqual(recovered.artifacts(), [artifact]);
    assert.equal(recoveredJournal.records().length, 2);
    assert.equal(recoveredJournal.records()[1].entry.payload.artifact.encoding, PORTABLE_JSON_ENCODING);
    const bytes = fs.readFileSync(file);
    const reopened = new FileJournal(file);
    assert.deepEqual(new ArtifactCheckpointRecorder(reopened, appendTo(reopened)).artifacts(), [artifact]);
    assert.deepEqual(fs.readFileSync(file), bytes);
  });
});

test('independent unknown-codec disk record rejects without mutating journal bytes', async () => {
  await fixture(async ({ root, artifact }) => {
    const file = path.join(root, 'events.jsonl');
    const journal = new FileJournal(file);
    appendTo(journal)('artifact.created', { runId: attempt.runId, stageId: attempt.stageId },
      { artifact: { ...artifact, encoding: 'future-codec' } });
    const bytes = fs.readFileSync(file);
    const reopened = new FileJournal(file);
    assert.throws(() => new ArtifactCheckpointRecorder(reopened, appendTo(reopened)), /ARTIFACT_CHECKPOINT_ENCODING_INVALID/);
    assert.deepEqual(fs.readFileSync(file), bytes);
  });
});

test('independent unknown-codec recording rejects before journal append', async () => {
  await fixture(async ({ root, artifact }) => {
    const journal = new FileJournal(path.join(root, 'events.jsonl'));
    const recorder = new ArtifactCheckpointRecorder(journal, appendTo(journal));
    for (const encoding of [null, 'future-codec']) {
      assert.throws(() => recorder.checkpoint({ ...artifact, encoding }), /ARTIFACT_CHECKPOINT_ENCODING_INVALID/);
    }
    assert.equal(journal.records().length, 0);
    assert.deepEqual(recorder.artifacts(), []);
  });
});
