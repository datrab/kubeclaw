import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { artifactFromWrite, ArtifactCheckpointRecorder } from '../../../skills/nova/core/execution/artifact-checkpoints.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';

const attempt = { runId: 'run:encoding', stageId: 'producer', attemptId: 'attempt:encoding', attemptNumber: 1 };
const value = { z: 1, ä: 2, Z: { ö: 3, a: 4 } };

async function withStore(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-encoding-'));
  const store = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
  await store.ready();
  const write = async (id, encoding, payload = value) => {
    const request = { capability: 'artifacts.write', operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: id },
      payload: { namespace: 'test.checkpoint', mediaType: 'application/json', checkpoint: true, value: payload,
        ...(encoding === undefined ? {} : { encoding }) }, attempt, idempotencyKey: id };
    return { request, response: await store.invoke({ confidential: true, signal: new AbortController().signal, request }) };
  };
  try { await body({ root, store, write }); }
  finally { await store.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
}

function recorder(file) {
  const journal = new FileJournal(file);
  const append = (type, identity, payload, causationId) => {
    let event;
    journal.appendSequenced(sequence => event = { schemaVersion: 'lifecycle-event.v2',
      eventId: `checkpoint:${sequence}`, sequence, type, identity, payload, causationId,
      occurredAt: '2026-09-09T00:00:00.000Z' });
    return event;
  };
  return new ArtifactCheckpointRecorder(journal, append);
}

test('real portable ArtifactStore write checkpoints and reopens unchanged across actual locales', async () => {
  await withStore(async ({ root, write }) => {
    const { request, response } = await write('portable:checkpoint', PORTABLE_JSON_ENCODING);
    const artifact = artifactFromWrite(attempt, request, response);
    assert.deepEqual(artifact, response.artifact);
    const journal = path.join(root, 'events.jsonl');
    recorder(journal).checkpoint(artifact);
    const original = fs.readFileSync(journal);
    const module = new URL('../../../skills/nova/core/execution/artifact-checkpoints.ts', import.meta.url).href;
    const journalModule = new URL('../../../skills/nova/core/state/journal.ts', import.meta.url).href;
    const code = `import {artifactFromWrite,ArtifactCheckpointRecorder} from ${JSON.stringify(module)};
      import {FileJournal} from ${JSON.stringify(journalModule)};
      const ref=artifactFromWrite(${JSON.stringify(attempt)},${JSON.stringify(request)},${JSON.stringify(response)});
      const recorder=new ArtifactCheckpointRecorder(new FileJournal(${JSON.stringify(journal)}),()=>{throw Error('duplicate append');});
      recorder.checkpoint(ref);recorder.result(ref);
      process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,refs:recorder.artifacts()}));`;
    for (const [locale, expected] of [['en_US.UTF-8', 'en-US'], ['sv_SE.UTF-8', 'sv-SE']]) {
      const env = { ...process.env, LANG: locale, LC_ALL: locale };
      delete env.NODE_TEST_CONTEXT;
      const reopened = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, encoding: 'utf8' }));
      assert.equal(reopened.locale, expected);
      assert.deepEqual(reopened.refs, [artifact]);
      assert.deepEqual(fs.readFileSync(journal), original);
    }
  });
});

test('legacy checkpoints retain their exact original reference and journal bytes', async () => {
  await withStore(async ({ root, write }) => {
    const { request, response } = await write('legacy:checkpoint');
    assert.equal(Object.hasOwn(response.artifact, 'encoding'), false);
    const artifact = artifactFromWrite(attempt, request, response);
    const file = path.join(root, 'events.jsonl');
    recorder(file).checkpoint(artifact);
    const bytes = fs.readFileSync(file);
    recorder(file).result(artifact);
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.deepEqual(recorder(file).artifacts(), [response.artifact]);
  });
});

test('checkpoint codec binding rejects unknown encodings and authenticated same-byte relabels', async () => {
  await withStore(async ({ write }) => {
    const { request, response } = await write('same-byte', PORTABLE_JSON_ENCODING, { a: 1 });
    for (const encoding of ['unknown.v1', null]) {
      assert.throws(() => artifactFromWrite(attempt, { ...request, payload: { ...request.payload, encoding } }, response), /ARTIFACT_CHECKPOINT_ENCODING_INVALID/);
    }
    const { encoding, ...untagged } = response.artifact;
    assert.throws(() => artifactFromWrite(attempt, request, { ...response, artifact: untagged }), /ARTIFACT_CHECKPOINT_RESPONSE_INVALID/);
    const { encoding: requestedEncoding, ...legacyPayload } = request.payload;
    assert.throws(() => artifactFromWrite(attempt, { ...request, payload: legacyPayload }, response), /ARTIFACT_CHECKPOINT_RESPONSE_INVALID/);
  });
});

test('recorder does not collapse same-byte references carrying different codec identities', async () => {
  await withStore(async ({ root, write }) => {
    const { response } = await write('same-byte:recorder', PORTABLE_JSON_ENCODING, { a: 1 });
    const file = path.join(root, 'events.jsonl');
    recorder(file).checkpoint(response.artifact);
    const bytes = fs.readFileSync(file);
    const { encoding, ...untagged } = response.artifact;
    assert.throws(() => recorder(file).checkpoint(untagged), /ARTIFACT_CHECKPOINT_CONFLICT/);
    assert.deepEqual(fs.readFileSync(file), bytes);
  });
});
