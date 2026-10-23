import { retireOperatorRequest } from '../../../scripts/retire-operator-request.mjs';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
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
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { projectWaitValue } from '../../../skills/common/plugin-runtime/foundation/observability/wait-projection.ts';
import { resolveRetainedCoreWait } from '../../../skills/nova/core/state/wait-projection-reader.ts';
import { retireWaitValue } from '../../../scripts/retire-wait-value.mjs';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const recordFile = root => path.join(root, 'records/store.json');
export function waitScope(f, pendingSignal = false) {
  const names = ['run-snapshot.json', 'events.jsonl', 'effects.jsonl', 'signals.jsonl'];
  const files = names.map(name => {
    if (pendingSignal && name === 'signals.jsonl') return { name, dev: 0, ino: 0 };
    const stat = fs.lstatSync(path.join(f.run, name)); return { name, dev: stat.dev, ino: stat.ino };
  });
  const stat = fs.lstatSync(f.run), original = json(recordFile(f.waitRoot)).records.find(record => record.idempotencyKey === f.waitRequest.idempotencyKey);
  const terminal = json(recordFile(f.deliveryRoot)).records.find(record => record.payload.schemaVersion === 'notification-delivery-receipt.v1');
  const bytes = Object.fromEntries(names.map(name => [name, pendingSignal && name === 'signals.jsonl'
    ? Buffer.from(`${JSON.stringify(f.signal)}\n`) : fs.readFileSync(path.join(f.run, name))]));
  return { schemaVersion: 'wait-value-retirement-scope.v1', action: 'project-completed-human-approval-wait',
    novaStorageRoot: f.platform.storageRoot, orchestratorIssuerId: f.platform.orchestratorIssuerId,
    intent: { operationId: 'wait:retire-local', actor: 'operator:local', waitRoot: f.waitRoot, deliveryRoot: f.deliveryRoot,
      operatorEffectKey: f.request.idempotencyKey, terminalPayloadDigest: terminal.payloadDigest,
      source: { schemaVersion: 'retained-core-wait-source.v1', runId: f.runId,
        runJournalHead: JSON.parse(bytes['events.jsonl'].toString().trim().split('\n').at(-1)).hash,
        snapshotDigest: json(path.join(f.run, 'run-snapshot.json')).digest,
        eventsDigest: hash(bytes['events.jsonl']), effectsDigest: hash(bytes['effects.jsonl']), signalsDigest: hash(bytes['signals.jsonl']),
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
  const waitingBytes = fs.readFileSync(recordFile(f.waitRoot));
  // This is only a proposed signal: no durable signal file or authority exists.
  // The executor must diagnose the actual waiting run before trusting that proposal.
  assert.equal(fs.existsSync(path.join(f.run, 'signals.jsonl')), false);
  await assert.rejects(retireWaitValue(waitScope(f, true)), /RUN_ACTIVE_OR_WAITING/);
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), waitingBytes);
  assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
  const scope = waitScope(f), before = fs.readFileSync(recordFile(f.waitRoot));
  const result = await retireWaitValue(scope);
  assert.equal(result.newlyProjected, true);
  assert.equal(result.releasedBytes, before.length - fs.statSync(recordFile(f.waitRoot)).size);
  assert.ok(result.releasedBytes > 0);
  assert.deepEqual(await retireWaitValue(scope), { newlyProjected: false, releasedBytes: 0 });
  const retained = fs.readFileSync(recordFile(f.waitRoot));
  const limits = { maximumRecords: 100000, maximumBytes: 268435456, maximumRecordBytes: 1048576 };
  const owner = new FileDurableRecordStore(f.waitRoot, limits);
  const projection = json(recordFile(f.waitRoot)).records.find(record => record.idempotencyKey === f.waitRequest.idempotencyKey).payload;
  const resolve = source => resolveRetainedCoreWait(source, { storageRoot: f.platform.storageRoot,
    waitRoot: f.waitRoot, orchestratorIssuerId: f.platform.orchestratorIssuerId });
  for (const alias of [owner, new FileDurableRecordStore(f.waitRoot, limits)]) {
    let authorized = false;
    await assert.rejects(projectWaitValue(owner, alias, 'notifications/operators', scope.intent,
      projection.projection.authorityDigest, resolve, () => { authorized = true; }), /DURABLE_RECORD_RETAINED_STORE_ALIAS/);
    assert.equal(authorized, false, 'an aliased repeat must reject before its authorization callback');
    assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), retained);
  }
  const oldEvents = fs.readFileSync(path.join(f.run, 'events.jsonl'));
  await assert.rejects(runPipelineV2(f.platform, f.definition, f.runId), /RUN_ALREADY_EXISTS/);
  assert.deepEqual(fs.readFileSync(path.join(f.run, 'events.jsonl')), oldEvents);
  // Invoke the actual owner runtime, whose EffectCoordinator appends its real
  // requested/accepted/completed events to the retained run. No handmade tail.
  const lateCore = await actualReader(f);
  try { assert.deepEqual((await lateCore.invoke('read', 'read:late-core-producer')).waits, [f.wait]); }
  finally { await lateCore.runtime.shutdown(); }
  assert.ok(fs.statSync(path.join(f.run, 'events.jsonl')).size > oldEvents.length);
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
      // Outer record-key order is not part of the canonical journal head.
      // Reordering it preserves the valid logical chain and exact byte length,
      // but must still fail the retained original raw-prefix identity.
      const lines = original.toString().trimEnd().split('\n');
      const first = JSON.parse(lines[0]);
      lines[0] = JSON.stringify(Object.fromEntries(Object.entries(first).reverse()));
      const reordered = Buffer.from(lines.join('\n') + '\n');
      assert.equal(reordered.length, original.length);
      assert.notDeepEqual(reordered, original);
      fs.writeFileSync(file, reordered);
      await assert.rejects(read(), /EVIDENCE/);
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

test('fixed real Wait byte quota admits original Core work only after measured savings and record quota is unchanged', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const before = fs.readFileSync(recordFile(f.waitRoot));
  const quota = before.length + 128;
  const platform = structuredClone(f.platform);
  platform.adapters['kubeclaw.wait-store:waits'].maximumStoreBytes = quota;
  platform.adapters['kubeclaw.wait-store:waits'].maximumRecords = 2;
  const configuration = structuredClone(platform.adapters['kubeclaw.wait-store:waits']);
  const definition = structuredClone(f.definition);
  definition.stages[0].input.summary = 'Fixed quota next original approval. '.repeat(35);
  assert.ok(before.length <= quota);
  const rejected = await runPipelineV2(platform, definition, 'run:wait-quota-before');
  assert.notEqual(rejected.status, 'waiting');
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), before);
  assert.equal(f.received.length, 1);
  const result = await retireWaitValue(waitScope(f));
  const projectedBytes = fs.statSync(recordFile(f.waitRoot)).size;
  assert.equal(result.releasedBytes, before.length - projectedBytes);
  assert.ok(projectedBytes <= before.length && projectedBytes <= quota);
  assert.deepEqual(platform.adapters['kubeclaw.wait-store:waits'], configuration);
  const accepted = await runPipelineV2(platform, definition, 'run:wait-quota-after');
  assert.equal(accepted.status, 'waiting');
  assert.equal(f.received.length, 2);
  const final = fs.readFileSync(recordFile(f.waitRoot));
  assert.ok(final.length <= quota);
  assert.equal(json(recordFile(f.waitRoot)).records.length, 2);
  const countRejected = await runPipelineV2(platform, definition, 'run:wait-quota-count');
  assert.notEqual(countRejected.status, 'waiting');
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), final);
  assert.equal(f.received.length, 2);
  assert.deepEqual(platform.adapters['kubeclaw.wait-store:waits'], configuration);
  console.log(JSON.stringify({ proof: 'actual-wait-adapter-byte-and-count-quota', originalInitialQuota: 268435456,
    fixedLaterQuota: quota, fixedLaterRecordQuota: 2, originalSerializedBytes: before.length, projectedSerializedBytes: projectedBytes,
    finalSerializedBytesIncludingMetadata: final.length, releasedBytes: result.releasedBytes,
    rejected: rejected.status, admitted: accepted.status, recordRejected: countRejected.status }));
});

function childWorker(t, file, mode, data) {
  const child = fork(path.resolve(file), [mode, JSON.stringify(data)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const messages = [], pending = [];
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.on('message', message => { if (pending.length) pending.shift()(message); else messages.push(message); });
  const exit = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  return { child, exit, next: () => messages.length ? Promise.resolve(messages.shift()) : new Promise(resolve => pending.push(resolve)), stderr: () => stderr };
}
const projectionWorker = 'tests/verification/reliability/fixtures/wait-projection-worker.mjs';
const deliveryWorker = 'tests/verification/reliability/fixtures/operator-retention-worker.mjs';

test('real separate delivery writer fence blocks Wait commit and late original writers retain the accepted receipt', { timeout: 60000 }, async t => {
  const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const scope = waitScope(f), original = json(recordFile(f.deliveryRoot)).records;
  const terminal = original.find(record => record.payload.schemaVersion === 'notification-delivery-receipt.v1');
  const data = { scope: { intent: { ...scope.intent, runRoot: f.run } }, request: f.request,
    reservation: { stream: terminal.stream, key: terminal.idempotencyKey,
      digest: payloadDigest({ schemaVersion: 'notification-delivery-reservation.v1', attempt: f.request.attempt, reserved: ' '.repeat(8192) }) } };
  const held = childWorker(t, deliveryWorker, 'hold-delivery', data);
  assert.equal(await held.next(), 'held');
  const before = fs.readFileSync(recordFile(f.waitRoot));
  const projecting = childWorker(t, projectionWorker, 'project', scope);
  assert.equal(await projecting.next(), 'started');
  const late = ['complete', 'fail'].map(mode => childWorker(t, deliveryWorker, mode, data));
  for (const writer of late) assert.equal(await writer.next(), 'started');
  await delay(200);
  assert.equal(projecting.child.exitCode, null);
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), before);
  held.child.send('release'); assert.deepEqual(await held.exit, [0, null], held.stderr());
  assert.equal((await projecting.next()).result.newlyProjected, true);
  assert.deepEqual(await projecting.exit, [0, null], projecting.stderr());
  for (const writer of late) {
    assert.deepEqual((await writer.next()).receipt, terminal.payload.receipt);
    assert.deepEqual(await writer.exit, [0, null], writer.stderr());
  }
  assert.deepEqual(json(recordFile(f.deliveryRoot)).records, original);
  assert.equal(f.received.length, 1);
});

for (const mode of ['before-rename', 'after-rename']) {
  test(`actual SIGKILL ${mode} leaves one atomic Wait state and retry never reinflates original bytes`, { timeout: 60000 }, async t => {
    const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
    const scope = waitScope(f), before = fs.readFileSync(recordFile(f.waitRoot));
    const process = childWorker(t, projectionWorker, mode, scope);
    assert.equal(await process.next(), 'started');
    assert.equal(await process.next(), mode);
    process.child.kill('SIGKILL');
    const [, signal] = await process.exit; assert.equal(signal, 'SIGKILL');
    const observed = fs.readFileSync(recordFile(f.waitRoot));
    if (mode === 'before-rename') assert.deepEqual(observed, before);
    else assert.equal(json(recordFile(f.waitRoot)).records[0].payload.schemaVersion, 'wait-value-projected.v1');
    const retry = await retireWaitValue(scope);
    assert.equal(retry.newlyProjected, mode === 'before-rename');
    if (mode === 'after-rename') { assert.equal(retry.releasedBytes, 0); assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), observed); }
    assert.deepEqual(await retireWaitValue(scope), { newlyProjected: false, releasedBytes: 0 });
    assert.equal(f.received.length, 1);
  });
}

test('wrong source/receipt identities, aliased/reversed domains and changed intent cannot authorize Wait replacement', { timeout: 60000 }, async t => {
  const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const scope = waitScope(f), before = fs.readFileSync(recordFile(f.waitRoot));
  const deliveryFile = recordFile(f.deliveryRoot), deliveryBytes = fs.readFileSync(deliveryFile);
  const originalDelivery = json(deliveryFile);
  // Actual original authority decoder is exercised through the new executor,
  // not inferred from its predecessor's tests. These are deliberate on-disk faults.
  let faultIndex = 0;
  for (const corrupt of [
    state => { state.records.pop(); },
    state => { const terminal = state.records[1]; terminal.payload = { schemaVersion: 'notification-delivery-failure.v1', outcome: 'possible', attempt: f.request.attempt }; terminal.payloadDigest = payloadDigest(terminal.payload); },
    state => { const request = state.records[0]; request.payload.schemaVersion = 'notification-delivery-request.v2'; request.payloadDigest = payloadDigest(request.payload); },
    state => { const terminal = state.records[1]; assert.ok(terminal.payload.attempt); delete terminal.payload.attempt; terminal.payloadDigest = payloadDigest(terminal.payload); },
  ]) {
    const changed = structuredClone(originalDelivery); corrupt(changed);
    assert.notDeepEqual(changed, originalDelivery, 'each fault must alter actual durable authority');
    fs.writeFileSync(deliveryFile, JSON.stringify(changed));
    const corruptBytes = fs.readFileSync(deliveryFile);
    await assert.rejects(retireWaitValue(scope), undefined, `durable authority fault ${faultIndex++} must reject`);
    assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), before);
    assert.deepEqual(fs.readFileSync(deliveryFile), corruptBytes);
  }
  fs.writeFileSync(deliveryFile, deliveryBytes);
  const otherDigest = `sha256:${'0'.repeat(64)}`;
  for (const field of ['runJournalHead', 'snapshotDigest', 'eventsDigest', 'effectsDigest', 'signalsDigest', 'rootIdentityDigest', 'originalPayloadDigest']) {
    const changed = structuredClone(scope); changed.intent.source[field] = otherDigest;
    await assert.rejects(retireWaitValue(changed));
    assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), before);
  }
  for (const changed of [
    { ...scope.intent, terminalPayloadDigest: otherDigest },
    { ...scope.intent, waitRoot: scope.intent.deliveryRoot, deliveryRoot: scope.intent.waitRoot },
    { ...scope.intent, waitRoot: scope.intent.deliveryRoot },
    { ...scope.intent, source: { ...scope.intent.source, effectKey: 'effect:foreign' } },
    { ...scope.intent, source: { ...scope.intent.source, inventoryLimits: { ...scope.intent.source.inventoryLimits, maximumTotalBytes: 1 } } },
  ]) {
    await assert.rejects(retireWaitValue({ ...scope, intent: changed }));
    assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), before);
  }
  const alias = path.join(f.root, 'wait-symlink'); fs.symlinkSync(f.waitRoot, alias);
  await assert.rejects(retireWaitValue({ ...scope, intent: { ...scope.intent, waitRoot: alias } }));
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), before);
  assert.equal((await retireWaitValue(scope)).newlyProjected, true);
  const projected = fs.readFileSync(recordFile(f.waitRoot));
  await assert.rejects(retireWaitValue({ ...scope, intent: { ...scope.intent, actor: 'operator:other' } }));
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), projected);
  assert.equal(f.received.length, 1);
});

test('a small original Wait cannot fund projection metadata and remains byte-identical', { timeout: 60000 }, async t => {
  const f = await fixture(t, { summary: 'Short genuine approval.' });
  await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const before = fs.readFileSync(recordFile(f.waitRoot));
  await assert.rejects(retireWaitValue(waitScope(f)), /WAIT_PROJECTION_NO_NET_SAVINGS/);
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), before);
  assert.equal(f.received.length, 1);
});

function operatorScope(f) {
  const records = json(recordFile(f.deliveryRoot)).records;
  const request = records.find(record => record.payload.schemaVersion === 'notification-delivery-request.v1');
  const terminal = records.find(record => record.payload.schemaVersion === 'notification-delivery-receipt.v1');
  const source = waitScope(f).intent.source;
  return { schemaVersion: 'operator-request-retirement-scope.v1', action: 'compact-completed-human-approval-request',
    novaStorageRoot: f.platform.storageRoot, orchestratorIssuerId: f.platform.orchestratorIssuerId,
    inventoryLimits: source.inventoryLimits,
    intent: { operationId: 'operator:before-wait', actor: 'operator:local', runRoot: f.run, runId: f.runId,
      waitRoot: f.waitRoot, deliveryRoot: f.deliveryRoot, effectKey: f.request.idempotencyKey,
      expectedPayloadDigest: request.payloadDigest, terminalPayloadDigest: terminal.payloadDigest,
      runJournalHead: source.runJournalHead, snapshotDigest: source.snapshotDigest } };
}

test('the existing operator projection receipt replays after Wait projection using the original logical Wait digest', { timeout: 60000 }, async t => {
  const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const operator = operatorScope(f);
  assert.equal((await retireOperatorRequest(operator)).newlyProjected, true);
  const delivery = fs.readFileSync(recordFile(f.deliveryRoot));
  const waiting = fs.readFileSync(recordFile(f.waitRoot)), scope = waitScope(f);
  const changedProjection = JSON.parse(delivery), projectedRequest = changedProjection.records.find(record =>
    record.payload.schemaVersion === 'notification-delivery-request-projected.v1');
  assert.ok(projectedRequest);
  projectedRequest.payload.projection.authorityDigest = `sha256:${'0'.repeat(64)}`;
  projectedRequest.payloadDigest = payloadDigest(projectedRequest.payload);
  fs.writeFileSync(recordFile(f.deliveryRoot), JSON.stringify(changedProjection));
  await assert.rejects(retireWaitValue(scope), /WAIT_RETENTION_REQUEST_CHANGED/);
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), waiting);
  fs.writeFileSync(recordFile(f.deliveryRoot), delivery);
  assert.equal((await retireWaitValue(scope)).newlyProjected, true);
  const wait = fs.readFileSync(recordFile(f.waitRoot));
  const replay = await retireOperatorRequest(operator);
  assert.equal(replay.newlyProjected, false); assert.equal(replay.releasedBytes, 0);
  assert.deepEqual(fs.readFileSync(recordFile(f.deliveryRoot)), delivery);
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), wait);
  fs.appendFileSync(path.join(f.run, 'effects.jsonl'), 'unrelated malformed suffix');
  // The operator's CURRENT authority verifier remains strict, even though a
  // standalone projected Wait read intentionally ignores unrelated tails.
  await assert.rejects(retireOperatorRequest(operator), /JOURNAL/);
  assert.deepEqual(fs.readFileSync(recordFile(f.deliveryRoot)), delivery);
  assert.equal(f.received.length, 1);
});
