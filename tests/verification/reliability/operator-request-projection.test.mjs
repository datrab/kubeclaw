import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { fixture } from './operator-retention-authority-fixture.test.mjs';
import { resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { reserveDelivery, deliveryReceipt, lookupDelivery, completeDelivery, failDelivery } from '../../../skills/common/plugins/operator-messaging/src/delivery-records.ts';
import { payloadDigest } from '../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { retireOperatorRequest } from '../../../scripts/retire-operator-request.mjs';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const recordsFile = root => path.join(root, 'records/store.json');
export function scope(f) {
  const records = json(recordsFile(f.deliveryRoot)).records;
  const request = records.find(record => record.payload.schemaVersion === 'notification-delivery-request.v1');
  const terminal = records.find(record => record.payload.schemaVersion === 'notification-delivery-receipt.v1');
  return { schemaVersion: 'operator-request-retirement-scope.v1', action: 'compact-completed-human-approval-request',
    novaStorageRoot: f.platform.storageRoot, orchestratorIssuerId: f.platform.orchestratorIssuerId,
    inventoryLimits: { maximumFiles: 10000, maximumTotalBytes: 32 * 1024 ** 2, maximumSnapshotBytes: 4 * 1024 ** 2 },
    intent: { operationId: 'operator:retire-local', actor: 'operator:local', runId: f.runId, runRoot: f.run,
      deliveryRoot: f.deliveryRoot, waitRoot: f.waitRoot, effectKey: f.request.idempotencyKey,
      expectedPayloadDigest: request.payloadDigest, terminalPayloadDigest: terminal.payloadDigest,
      runJournalHead: JSON.parse(fs.readFileSync(path.join(f.run, 'events.jsonl'), 'utf8').trim().split('\n').at(-1)).hash,
      snapshotDigest: json(path.join(f.run, 'run-snapshot.json')).digest } };
}

test('genuine original terminal human approval projects only duplicate request bytes and keeps exact original stale receipt replay', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  const before = fs.readFileSync(recordsFile(f.deliveryRoot));
  await assert.rejects(retireOperatorRequest(scope(f)), /RUN_ACTIVE_OR_WAITING/);
  assert.deepEqual(fs.readFileSync(recordsFile(f.deliveryRoot)), before);
  assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
  const selection = scope(f), original = json(recordsFile(f.deliveryRoot)).records;
  const authorityFiles = ['events.jsonl', 'effects.jsonl', 'signals.jsonl', 'run-snapshot.json'].map(name => path.join(f.run, name));
  authorityFiles.push(recordsFile(f.waitRoot));
  const authorityBytes = authorityFiles.map(file => fs.readFileSync(file));
  const result = await retireOperatorRequest(selection);
  assert.equal(result.newlyProjected, true);
  assert.equal(result.releasedBytes, before.length - fs.statSync(recordsFile(f.deliveryRoot)).size);
  assert.ok(result.releasedBytes > 4000);
  const projected = json(recordsFile(f.deliveryRoot)).records;
  assert.equal(projected.length, 2);
  assert.equal(projected[0].payload.schemaVersion, 'notification-delivery-request-projected.v1');
  assert.equal('payload' in projected[0].payload, false);
  assert.deepEqual(projected[1], original[1]);
  authorityFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), authorityBytes[index]));
  const store = new FileDurableRecordStore(f.deliveryRoot, { maximumRecords: 100, maximumBytes: 1048576, maximumRecordBytes: 2 * 1048576 + 65536 });
  const receipt = original[1].payload.receipt, bytes = fs.readFileSync(recordsFile(f.deliveryRoot));
  assert.deepEqual(await reserveDelivery(store, f.request, f.request.payload, false), receipt);
  assert.deepEqual(await deliveryReceipt(store, f.request), receipt);
  const stale = { stream: original[1].stream, key: original[1].idempotencyKey,
    digest: payloadDigest({ schemaVersion: 'notification-delivery-reservation.v1', attempt: f.request.attempt, reserved: ' '.repeat(8192) }) };
  assert.deepEqual(await completeDelivery(store, f.request, stale, { accepted: true, target: 'operators', status: 201 }), receipt);
  assert.deepEqual(await failDelivery(store, f.request, stale, true, new Error('late real producer timeout')), receipt);
  await assert.rejects(deliveryReceipt(store, { ...f.request, payload: { ...f.request.payload, summary: 'changed' } }), /OPERATOR_PROJECTION_AUTHORITY_REQUIRED/);
  await assert.rejects(lookupDelivery(store, f.request, f.request.idempotencyKey, 'approval', f.request.payload), /OPERATOR_RECEIPT_REQUEST_UNBOUND/);
  assert.deepEqual(await retireOperatorRequest(selection), { newlyProjected: false, releasedBytes: 0 });
  assert.deepEqual(fs.readFileSync(recordsFile(f.deliveryRoot)), bytes);
  assert.equal(f.received.length, 1);
  console.log(JSON.stringify({ proof: 'original-Core-approved-request-projection', releasedBytes: result.releasedBytes, records: projected.length, posts: f.received.length }));
});

function rewriteJournal(file, entries) {
  let previousHash = null;
  const records = entries.map((entry, index) => {
    const record = { sequence: index + 1, previousHash, entry };
    const hash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex')}`;
    previousHash = hash; return { ...record, hash };
  });
  fs.writeFileSync(file, records.map(record => JSON.stringify(record)).join('\n') + '\n');
}
const journalEntries = file => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);

test('actual persisted authority corruption refuses selected request, wait and signal mismatches without changing metadata', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const ef = path.join(f.run, 'effects.jsonl'), ev = path.join(f.run, 'events.jsonl'), sf = path.join(f.run, 'signals.jsonl');
  const before = fs.readFileSync(recordsFile(f.deliveryRoot));
  const files = [ef, ev, sf, recordsFile(f.waitRoot)], saved = files.map(file => fs.readFileSync(file));
  const restore = () => files.forEach((file, index) => fs.writeFileSync(file, saved[index]));
  const variants = [
    () => { const entries = journalEntries(ef); for (const entry of entries) if (entry.request?.idempotencyKey === f.request.idempotencyKey) entry.request.requestedAt = 'not-a-date'; rewriteJournal(ef, entries); },
    () => { const entries = journalEntries(ef); for (const entry of entries) if (entry.request?.idempotencyKey === f.request.idempotencyKey) entry.request.payload.summary = 'foreign input'; rewriteJournal(ef, entries); },
    () => { const entries = journalEntries(ef); for (const entry of entries) if (entry.request?.idempotencyKey === f.request.idempotencyKey) entry.request.attempt.stageId = 'foreign'; rewriteJournal(ef, entries); },
    () => { const records = json(recordsFile(f.waitRoot)); records.records[0].payload.wait.request.summary = 'foreign wait'; records.records[0].payloadDigest = payloadDigest(records.records[0].payload); fs.writeFileSync(recordsFile(f.waitRoot), JSON.stringify(records)); },
    ...['outer', 'inner', 'type'].map(kind => () => {
      const signal = structuredClone(f.signal);
      if (kind === 'outer') signal.issuer = { type: 'operator', id: 'operator:foreign' };
      if (kind === 'inner') signal.payload.issuer = { type: 'operator', id: 'operator:foreign' };
      if (kind === 'type') signal.signalType = 'approval.foreign';
      rewriteJournal(sf, [signal]);
      const events = journalEntries(ev); for (const event of events) if (event.type === 'wait.resolved') event.payload.signal = signal;
      rewriteJournal(ev, events);
    }),
    () => { const events = journalEntries(ev), indices = events.flatMap((event, index) => event.identity.effectId === f.request.effectId ? [index] : []);
      [events[indices[0]], events[indices[1]]] = [events[indices[1]], events[indices[0]]]; events.forEach((event, index) => { event.sequence = index + 1; }); rewriteJournal(ev, events); },
    () => fs.writeFileSync(ef, 'not a journal\n'),
  ];
  for (const corrupt of variants) {
    restore(); corrupt(); await assert.rejects(retireOperatorRequest(scope(f)));
    assert.deepEqual(fs.readFileSync(recordsFile(f.deliveryRoot)), before);
  }
  restore(); assert.equal((await retireOperatorRequest(scope(f))).newlyProjected, true);
  assert.equal(f.received.length, 1);
});

function worker(t, mode, data) {
  const child = fork(path.resolve('tests/verification/reliability/fixtures/operator-retention-worker.mjs'), [mode, JSON.stringify(data)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  return { child, exited, stderr: () => stderr };
}
test('actual separate-process run and wait fences block retention; SIGKILL releases owner and stale producers preserve accepted receipt', { timeout: 60000 }, async t => {
  const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const selection = scope(f), original = json(recordsFile(f.deliveryRoot)).records;
  const data = { scope: selection, request: f.request, reservation: { stream: original[1].stream, key: original[1].idempotencyKey,
    digest: payloadDigest({ schemaVersion: 'notification-delivery-reservation.v1', attempt: f.request.attempt, reserved: ' '.repeat(8192) }) } };
  for (const mode of ['hold-run', 'hold-delivery', 'hold-wait']) {
    const held = worker(t, mode, data); assert.deepEqual((await once(held.child, 'message'))[0], 'held');
    if (mode === 'hold-run') {
      const unchanged = fs.readFileSync(recordsFile(f.deliveryRoot));
      await assert.rejects(retireOperatorRequest(selection), /RESOURCE_LOCKED/);
      assert.deepEqual(fs.readFileSync(recordsFile(f.deliveryRoot)), unchanged);
      held.child.send('release'); await held.exited; continue;
    }
    let complete = false;
    const retiring = retireOperatorRequest(selection).then(value => { complete = true; return value; });
    await delay(200); assert.equal(complete, false);
    if (mode === 'hold-wait') held.child.kill('SIGKILL'); else held.child.send('release');
    await held.exited; await retiring;
  }
  const before = fs.readFileSync(recordsFile(f.deliveryRoot));
  const held = worker(t, 'hold-delivery', data); assert.deepEqual((await once(held.child, 'message'))[0], 'held');
  const producers = ['complete', 'fail'].map(mode => worker(t, mode, data));
  const receipts = producers.map(item => new Promise((resolve, reject) => {
    item.child.on('message', message => { if (message?.receipt) resolve(message.receipt); });
    item.exited.then(([code]) => { if (code !== 0) reject(new Error(item.stderr())); });
  }));
  await Promise.all(producers.map(item => once(item.child, 'message')));
  await delay(200); assert.ok(producers.every(item => item.child.exitCode === null));
  held.child.send('release'); await held.exited;
  for (const receipt of await Promise.all(receipts)) assert.deepEqual(receipt, original[1].payload.receipt);
  for (const item of producers) assert.deepEqual(await item.exited, [0, null], item.stderr());
  assert.deepEqual(fs.readFileSync(recordsFile(f.deliveryRoot)), before); assert.equal(f.received.length, 1);
});

test('real small byte quota admits later original Core notification after net savings but unchanged record count still bounds new work', { timeout: 60000 }, async t => {
  const f = await fixture(t, { maximumBytes: 23000, maximumRecords: 5 });
  await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const next = structuredClone(f.definition); next.stages[0].input.summary = 'Shorter original notification. '.repeat(130);
  const { runPipelineV2 } = await import('../../../skills/nova/core/execution/engine.ts');
  const rejected = await runPipelineV2(f.platform, next, 'run:operator-quota-before');
  assert.notEqual(rejected.status, 'waiting'); assert.equal(f.received.length, 1);
  const before = fs.readFileSync(recordsFile(f.deliveryRoot));
  const result = await retireOperatorRequest(scope(f));
  assert.equal(result.releasedBytes, before.length - fs.statSync(recordsFile(f.deliveryRoot)).size);
  const accepted = await runPipelineV2(f.platform, next, 'run:operator-quota-after');
  assert.equal(accepted.status, 'waiting'); assert.equal(f.received.length, 2);
  assert.equal(json(recordsFile(f.deliveryRoot)).records.length, 5);
  const bytes = fs.readFileSync(recordsFile(f.deliveryRoot));
  const countRejected = await runPipelineV2(f.platform, next, 'run:operator-quota-count');
  assert.notEqual(countRejected.status, 'waiting'); assert.equal(f.received.length, 2);
  assert.deepEqual(fs.readFileSync(recordsFile(f.deliveryRoot)), bytes);
  console.log(JSON.stringify({ realByteQuota: 23000, realRecordQuota: 5, releasedBytes: result.releasedBytes,
    firstQuotaResult: rejected.status, admitted: accepted.status, recordQuotaResult: countRejected.status, posts: f.received.length }));
});

test('real missing/conflicting receipts, unsupported v2 records, alias roots and foreign Core owner remain unprojected', { timeout: 60000 }, async t => {
  const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const selection = scope(f), file = recordsFile(f.deliveryRoot), saved = fs.readFileSync(file), original = json(file);
  const cases = [
    state => { state.records.pop(); },
    state => { const terminal = state.records[1]; terminal.payload.receipt.status = 500; terminal.payloadDigest = payloadDigest(terminal.payload); },
    state => { const terminal = state.records[1]; terminal.payload.attempt.attemptId = 'attempt:foreign'; terminal.payloadDigest = payloadDigest(terminal.payload); },
    state => { const terminal = state.records[1]; terminal.payload = { schemaVersion: 'notification-delivery-failure.v1', outcome: 'possible', attempt: f.request.attempt }; terminal.payloadDigest = payloadDigest(terminal.payload); },
    state => { const terminal = structuredClone(state.records[1]); terminal.sequence = 3; terminal.idempotencyKey = terminal.idempotencyKey.replace('attempt-1-', 'attempt-2-'); state.records.push(terminal); },
    state => { const request = state.records[0]; request.payload = { schemaVersion: 'notification-delivery-request.v2', idempotencyKey: f.request.idempotencyKey,
      target: 'operators', owner: { runId: f.runId, stageId: 'approval' }, transportBody: JSON.stringify(f.request.payload) }; request.payloadDigest = payloadDigest(request.payload); },
  ];
  for (const corrupt of cases) {
    const state = structuredClone(original); corrupt(state); fs.writeFileSync(file, JSON.stringify(state));
    const before = fs.readFileSync(file); await assert.rejects(retireOperatorRequest(selection)); assert.deepEqual(fs.readFileSync(file), before);
  }
  fs.writeFileSync(file, saved);
  await assert.rejects(retireOperatorRequest({ ...selection, intent: { ...selection.intent, waitRoot: f.deliveryRoot } }), /ALIASED_STORE/);
  const alias = path.join(f.root, 'wait-alias'); fs.symlinkSync(f.waitRoot, alias);
  await assert.rejects(retireOperatorRequest({ ...selection, intent: { ...selection.intent, waitRoot: alias } }), /ROOT_DIRECTORY_INVALID/);
  const nested = path.join(f.deliveryRoot, 'nested-waits'); fs.mkdirSync(nested);
  await assert.rejects(retireOperatorRequest({ ...selection, intent: { ...selection.intent, waitRoot: nested } }), /ALIASED_STORE/);
  const other = await fixture(t); await resumePipelineV2(other.platform, other.definition, other.runId, other.signal);
  const foreign = scope(other); foreign.intent.deliveryRoot = f.deliveryRoot; foreign.intent.waitRoot = f.waitRoot;
  foreign.intent.effectKey = selection.intent.effectKey; foreign.intent.expectedPayloadDigest = selection.intent.expectedPayloadDigest;
  foreign.intent.terminalPayloadDigest = selection.intent.terminalPayloadDigest;
  await assert.rejects(retireOperatorRequest(foreign), /OPERATOR_RETENTION_CORE_AUTHORITY_REQUIRED/);
  assert.deepEqual(fs.readFileSync(file), saved); assert.equal(f.received.length, 1);
});

test('small genuine original request cannot fund projection overhead and stays atomically unchanged', { timeout: 60000 }, async t => {
  const f = await fixture(t, { summary: 'Short actual approval.' });
  await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  const file = recordsFile(f.deliveryRoot), before = fs.readFileSync(file);
  await assert.rejects(retireOperatorRequest(scope(f)), /OPERATOR_PROJECTION_NO_NET_SAVINGS/);
  assert.deepEqual(fs.readFileSync(file), before); assert.equal(f.received.length, 1);
});
