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

test('independent: Wait first then first Operator projection preserves original authority and one POST', { timeout: 60000 }, async t => {
 const f = await fixture(t);
 assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
 const wait = waitScope(f), operator = operatorScope(f);
 assert.equal((await retireWaitValue(wait)).newlyProjected, true);
 const retainedWait = fs.readFileSync(recordFile(f.waitRoot));
 const result = await retireOperatorRequest(operator);
 assert.equal(result.newlyProjected, true); assert.ok(result.releasedBytes > 0);
 const retainedDelivery = fs.readFileSync(recordFile(f.deliveryRoot));
 assert.deepEqual(await retireOperatorRequest(operator), { newlyProjected: false, releasedBytes: 0 });
 assert.deepEqual(await retireWaitValue(wait), { newlyProjected: false, releasedBytes: 0 });
 assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), retainedWait);
 assert.deepEqual(fs.readFileSync(recordFile(f.deliveryRoot)), retainedDelivery);
 assert.equal(f.received.length, 1);
});
test('independent: foreign storage with same run ID and foreign issuer cannot authorize Wait projection', { timeout: 60000 }, async t => {
 const f = await fixture(t);
 assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
 const scope = waitScope(f), beforeWait = fs.readFileSync(recordFile(f.waitRoot)), beforeDelivery = fs.readFileSync(recordFile(f.deliveryRoot));
 const other = path.join(f.root, 'foreign-storage'); fs.cpSync(f.platform.storageRoot, other, { recursive: true });
 for (const changed of [{ ...scope, novaStorageRoot: other }, { ...scope, orchestratorIssuerId: 'foreign-orchestrator' }]) {
  await assert.rejects(retireWaitValue(changed));
  assert.deepEqual(fs.readFileSync(recordFile(f.waitRoot)), beforeWait);
  assert.deepEqual(fs.readFileSync(recordFile(f.deliveryRoot)), beforeDelivery);
 }
 assert.equal((await retireWaitValue(scope)).newlyProjected, true);
 assert.equal(f.received.length, 1);
});
