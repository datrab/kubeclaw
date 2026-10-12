import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fixture } from './operator-retention-authority-fixture.test.mjs';
import { resumePipelineV2, runPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { prepareRuntime, createAdapterRuntime } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { payloadDigest } from '../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { retireWaitValue } from '../../../scripts/retire-wait-value.mjs';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const recordFile = root => path.join(root, 'records/store.json');
export function waitScope(f) {
  const names = ['run-snapshot.json', 'events.jsonl', 'effects.jsonl', 'signals.jsonl'];
  const files = names.map(name => { const stat = fs.lstatSync(path.join(f.run, name)); return { name, dev: stat.dev, ino: stat.ino }; });
  const stat = fs.lstatSync(f.run), original = json(recordFile(f.waitRoot)).records.find(record => record.idempotencyKey === f.waitRequest.idempotencyKey);
  const terminal = json(recordFile(f.deliveryRoot)).records.find(record => record.payload.schemaVersion === 'notification-delivery-receipt.v1');
  const bytes = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(f.run, name))]));
  return { schemaVersion: 'wait-value-retirement-scope.v1', action: 'project-completed-human-approval-wait',
    novaStorageRoot: f.platform.storageRoot, orchestratorIssuerId: f.platform.orchestratorIssuerId,
    intent: { operationId: 'wait:retire-local', actor: 'operator:local', waitRoot: f.waitRoot, deliveryRoot: f.deliveryRoot,
      operatorEffectKey: f.request.idempotencyKey, terminalPayloadDigest: terminal.payloadDigest,
      source: { schemaVersion: 'retained-core-wait-source.v1', runId: f.runId,
        runJournalHead: JSON.parse(bytes['events.jsonl'].toString().trim().split('\n').at(-1)).hash,
        snapshotDigest: json(path.join(f.run, 'run-snapshot.json')).digest,
        effectsDigest: hash(bytes['effects.jsonl']), signalsDigest: hash(bytes['signals.jsonl']),
        eventsPrefixBytes: bytes['events.jsonl'].length, effectsPrefixBytes: bytes['effects.jsonl'].length,
        signalsPrefixBytes: bytes['signals.jsonl'].length,
        rootIdentityDigest: payloadDigest({ root: f.run, dev: stat.dev, ino: stat.ino, files }),
        effectKey: f.waitRequest.idempotencyKey, waitId: f.wait.waitId, originalPayloadDigest: original.payloadDigest,
        inventoryLimits: { maximumFiles: 10000, maximumTotalBytes: 32 * 1024 ** 2, maximumSnapshotBytes: 4 * 1024 ** 2 } } } };
}
async function actualReader(f, root = f.run) {
  const prepared = await prepareRuntime(f.platform, f.definition);
  const runtime = createAdapterRuntime(f.platform, root, prepared, new FileJournal(path.join(root, 'events.jsonl')));
  await runtime.start();
  return { runtime, invoke: (operation, key, payload = {}) => runtime.invoke('signal.wait', f.waitRequest.attempt, key,
    { operation, resource: f.waitRequest.resource, payload }, new AbortController().signal) };
}

test('real terminal approval projects Wait bytes, uses actual Core-owned adapter reader and keeps late duplicate identity', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
  const scope = waitScope(f), before = fs.readFileSync(recordFile(f.waitRoot));
  const result = await retireWaitValue(scope);
  assert.equal(result.newlyProjected, true);
  assert.equal(result.releasedBytes, before.length - fs.statSync(recordFile(f.waitRoot)).size);
  assert.ok(result.releasedBytes > 0);
  assert.deepEqual(await retireWaitValue(scope), { newlyProjected: false, releasedBytes: 0 });
  const retained = fs.readFileSync(recordFile(f.waitRoot));
  const oldEvents = fs.readFileSync(path.join(f.run, 'events.jsonl'));
  await assert.rejects(runPipelineV2(f.platform, f.definition, f.runId), /RUN_ALREADY_EXISTS/);
  assert.deepEqual(fs.readFileSync(path.join(f.run, 'events.jsonl')), oldEvents);
  // A fresh actual Core effect journal forces the original installed adapter to
  // perform duplicate handling instead of returning a cached effect receipt.
  const reader = await actualReader(f, path.join(f.root, 'late-reader'));
  try {
    assert.deepEqual(await reader.invoke('create', f.waitRequest.idempotencyKey, f.waitRequest.payload), { created: false, wait: f.wait });
    assert.deepEqual((await reader.invoke('read', 'read:retained')).waits, [f.wait]);
    await assert.rejects(reader.invoke('create', f.waitRequest.idempotencyKey, { ...f.waitRequest.payload, signalType: 'changed' }), /CONFLICT/);
    fs.appendFileSync(path.join(f.run, 'effects.jsonl'), 'unrelated malformed suffix');
    assert.deepEqual((await reader.invoke('read', 'read:unrelated-tail')).waits, [f.wait]);
    assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), retained);
    assert.equal(f.received.length, 1);
  } finally { await reader.runtime.shutdown(); }
});

test('retained original prefix mutation, truncation and same-byte inode replacement fail without rewriting the projected Wait', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
  await retireWaitValue(waitScope(f));
  const waitBytes = fs.readFileSync(recordFile(f.waitRoot));
  const reader = await actualReader(f, path.join(f.root, 'negative-reader'));
  let sequence = 0;
  const read = () => reader.invoke('read', `negative:${++sequence}`);
  try {
    for (const name of ['events.jsonl', 'effects.jsonl', 'signals.jsonl']) {
      const file = path.join(f.run, name), original = fs.readFileSync(file);
      const mutation = Buffer.from(original); mutation[mutation.indexOf(0x61)] = 0x62;
      fs.writeFileSync(file, mutation);
      await assert.rejects(read(), /JOURNAL|EVIDENCE|HASH/);
      fs.writeFileSync(file, original);
      assert.deepEqual((await read()).waits, [f.wait]);
      fs.truncateSync(file, original.length - 1);
      await assert.rejects(read(), /JOURNAL|EVIDENCE|REPLAY|attempt-journal/);
      fs.writeFileSync(file, original);
      assert.deepEqual((await read()).waits, [f.wait]);
      const saved = `${file}.retained-original`;
      fs.renameSync(file, saved); fs.writeFileSync(file, original);
      try { await assert.rejects(read(), /EVIDENCE/); }
      finally { fs.renameSync(saved, file); }
      assert.deepEqual((await read()).waits, [f.wait]);
      assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), waitBytes);
    }
    assert.equal(f.received.length, 1);
  } finally { await reader.runtime.shutdown(); }
});
