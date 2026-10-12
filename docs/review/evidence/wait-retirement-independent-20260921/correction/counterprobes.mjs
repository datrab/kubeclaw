import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fixture } from '../../../../../tests/verification/reliability/operator-retention-authority-fixture.test.mjs';
import { waitScope } from '../../../../../tests/verification/reliability/wait-value-projection.test.mjs';
import { resumePipelineV2 } from '../../../../../skills/nova/core/execution/engine.ts';
import { retireWaitValue } from '../../../../../scripts/retire-wait-value.mjs';
import { retireOperatorRequest } from '../../../../../scripts/retire-operator-request.mjs';
const recordFile = root => path.join(root, 'records/store.json');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
// Scope construction copied from the maintained real fixture; production executors are called directly.
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

import { hashJournalRecord, parseHashJournal } from '../../../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
import { resolveRetainedCoreWait } from '../../../../../skills/nova/core/state/wait-projection-reader.ts';
test('corrected independent: foreign storage retains same run ID but cannot authorize original records', { timeout: 60000 }, async t => {
 const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
 const scope = waitScope(f), beforeWait = fs.readFileSync(recordFile(f.waitRoot)), beforeDelivery = fs.readFileSync(recordFile(f.deliveryRoot));
 const other = path.join(f.root, 'foreign-storage'); fs.cpSync(f.platform.storageRoot, other, { recursive: true });
 await assert.rejects(retireWaitValue({ ...scope, novaStorageRoot: other }));
 assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), beforeWait);
 assert.deepEqual(fs.readFileSync(recordFile(f.deliveryRoot)), beforeDelivery);
 assert.equal((await retireWaitValue(scope)).newlyProjected, true); assert.equal(f.received.length, 1);
});
test('corrected independent: validly hashed foreign approval signal issuer rejects at actual authority', { timeout: 60000 }, async t => {
 const f = await fixture(t); await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
 const file = path.join(f.run, 'signals.jsonl'), original = fs.readFileSync(file);
 const beforeWait = fs.readFileSync(recordFile(f.waitRoot)), beforeDelivery = fs.readFileSync(recordFile(f.deliveryRoot));
 const records = parseHashJournal(original, file); assert.equal(records.length, 1);
 records[0].entry.issuer = { type: 'operator', id: 'foreign-operator' };
 records[0].entry.payload.issuer = records[0].entry.issuer;
 records[0].hash = hashJournalRecord(records[0].sequence, records[0].previousHash, records[0].entry);
 const changed = Buffer.from(JSON.stringify(records[0]) + '\n');
 assert.equal(parseHashJournal(changed, file).length, 1); fs.writeFileSync(file, changed);
 const scope = waitScope(f); // Binds the actual changed byte length and raw hash; no stale-hash rejection.
 assert.throws(() => resolveRetainedCoreWait(scope.intent.source, {storageRoot:f.platform.storageRoot, waitRoot:f.waitRoot, orchestratorIssuerId:f.platform.orchestratorIssuerId}), /WAIT_RETAINED_CORE_EVIDENCE_INVALID/);
 await assert.rejects(retireWaitValue(scope), /OPERATOR_RETENTION_CORE_AUTHORITY_REQUIRED/);
 assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), beforeWait);
 assert.deepEqual(fs.readFileSync(recordFile(f.deliveryRoot)), beforeDelivery);
 fs.writeFileSync(file, original);
 assert.equal((await retireWaitValue(waitScope(f))).newlyProjected, true); assert.equal(f.received.length, 1);
});
