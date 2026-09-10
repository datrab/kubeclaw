import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fixture } from './operator-retention-authority-fixture.test.mjs';
import { resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { reserveDelivery, deliveryReceipt, lookupDelivery, completeDelivery, failDelivery } from '../../../skills/common/plugins/operator-messaging/src/delivery-records.ts';
import { payloadDigest } from '../../../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { retireOperatorRequest } from '../../../scripts/retire-operator-request.mjs';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const recordsFile = root => path.join(root, 'records/store.json');
function scope(f) {
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
