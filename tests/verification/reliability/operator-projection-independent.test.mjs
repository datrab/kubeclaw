import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fixture } from './operator-retention-authority-fixture.test.mjs';
import { resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { retireOperatorRequest } from '../../../scripts/retire-operator-request.mjs';

const recordFile = root => path.join(root, 'records/store.json');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function selection(f) {
  const records = json(recordFile(f.deliveryRoot)).records;
  return { schemaVersion: 'operator-request-retirement-scope.v1', action: 'compact-completed-human-approval-request',
    novaStorageRoot: f.platform.storageRoot, orchestratorIssuerId: f.platform.orchestratorIssuerId,
    inventoryLimits: { maximumFiles: 10000, maximumTotalBytes: 32 * 1024 ** 2, maximumSnapshotBytes: 4 * 1024 ** 2 },
    intent: { operationId: 'independent:operator-projection', actor: 'operator:local', runId: f.runId, runRoot: f.run,
      deliveryRoot: f.deliveryRoot, waitRoot: f.waitRoot, effectKey: f.request.idempotencyKey,
      expectedPayloadDigest: records.find(record => record.payload.schemaVersion === 'notification-delivery-request.v1').payloadDigest,
      terminalPayloadDigest: records.find(record => record.payload.schemaVersion === 'notification-delivery-receipt.v1').payloadDigest,
      runJournalHead: new FileJournal(path.join(f.run, 'events.jsonl')).records().at(-1).hash,
      snapshotDigest: json(path.join(f.run, 'run-snapshot.json')).digest } };
}

test('independent conflicting original signal idempotency key cannot authorize projection even under another waitId', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
  const scope = selection(f), file = recordFile(f.deliveryRoot), before = fs.readFileSync(file);
  // Deliberate corruption of a genuine completed run: original recordSignal
  // would reject this same key with changed content. Generic FileJournal keeps
  // an honest chain; this is not fabricated successful producer history.
  const signals = new FileJournal(path.join(f.run, 'signals.jsonl'));
  signals.append({ ...f.signal, signalId: 'signal:conflicting', waitId: 'wait:conflicting' });
  assert.equal(signals.records().length, 2);
  await assert.rejects(retireOperatorRequest(scope));
  assert.deepEqual(fs.readFileSync(file), before);
});

test('independent original wait fence preserves immutable operator scope despite caller mutation across await', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  assert.equal((await resumePipelineV2(f.platform, f.definition, f.runId, f.signal)).status, 'succeeded');
  const scope = selection(f), expected = structuredClone(scope.intent);
  const waits = new FileDurableRecordStore(f.waitRoot, { maximumRecords: 100000, maximumBytes: 268435456, maximumRecordBytes: 1048576 });
  let release, held;
  const entered = new Promise(resolve => { held = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const owner = waits.withRecords('waits/all', async () => { held(); await gate; });
  await entered;
  const operation = retireOperatorRequest(scope);
  scope.intent.actor = 'operator:changed'; scope.intent.operationId = 'independent:changed';
  scope.inventoryLimits.maximumTotalBytes = 1;
  release(); await owner;
  assert.equal((await operation).newlyProjected, true);
  const stored = json(recordFile(f.deliveryRoot)).records.find(record => record.payload.schemaVersion === 'notification-delivery-request-projected.v1');
  assert.deepEqual(stored.payload.projection.intent, expected);
  assert.equal(f.received.length, 1);
});
