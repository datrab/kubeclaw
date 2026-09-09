import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHarness} from './adapter-dependency-locale-fixture.mjs';
import {materializeLegacyDependencyCore} from './adapter-dependency-historical.mjs';
import {hashJournalRecord} from '../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
import {stableEffectId} from '../../../skills/nova/core/effects/identity.ts';

function rewrite(file, entries) {
  let previousHash = null;
  fs.writeFileSync(file, entries.map((entry, index) => {
    const sequence = index + 1, hash = hashJournalRecord(sequence, previousHash, entry);
    const record = {sequence, previousHash, hash, entry}; previousHash = hash;
    return JSON.stringify(record);
  }).join('\n') + '\n');
}

for (const producer of ['legacy', 'current']) test(`independent ${producer} actual HTTP receipt must remain canonically valid after rehashed disk corruption`, async t => {
  const harness = createHarness();
  try {
    const origin = await harness.listen(), directory = harness.fixture('canonical-receipt-' + producer, origin);
    const source = producer === 'legacy' ? materializeLegacyDependencyCore(path.join(harness.root, 'historical')) : undefined;
    const initial = await harness.subprocess(directory, 'en_US.UTF-8', source);
    assert.equal(initial.signal, 'SIGKILL', initial.err);
    assert.equal(harness.received.length, 1);
    const file = path.join(directory, 'effects.jsonl'), original = fs.readFileSync(file);
    const entries = original.toString().trim().split('\n').map(line => JSON.parse(line).entry);
    assert.equal(entries.filter(row => row.type === 'completed').length, 1);
    const mutations = [
      ['unknown schema version', receipt => { receipt.schemaVersion = 'effect-receipt.future'; }],
      ['unexpected property', receipt => { receipt.unexpectedAuthority = true; }],
      ['invalid adapter package', receipt => { receipt.adapter = {packageId: 'not a valid package'}; }],
      ['valid but foreign adapter owner', receipt => { receipt.adapter.pluginId = 'foreign.network'; }],
      ['invalid status', receipt => { receipt.status = 'apparently-completed'; }],
      ['invalid timestamp', receipt => { receipt.recordedAt = '2026-99-99T00:00:00Z'; }],
      ['failed with success result and no error', receipt => { receipt.status = 'failed'; }],
      ['accepted with forbidden success result', receipt => { receipt.status = 'accepted'; }],
      ['wrong effect binding', receipt => { receipt.effectId = 'effect:utf16:v1:' + '0'.repeat(64); }],
    ];
    for (const [name, mutate] of mutations) {
      const changed = structuredClone(entries); mutate(changed.find(row => row.type === 'completed').receipt);
      rewrite(file, changed); const before = fs.readFileSync(file);
      const recovered = await harness.subprocess(directory, 'sv_SE.UTF-8');
      assert.equal(recovered.code, 1, `${name}: ${recovered.err}`);
      assert.match(recovered.err, /ADAPTER_DEPENDENCY_HISTORY_INVALID|ADAPTER_DEPENDENCY_RECEIPT_OWNER_MISMATCH|REGISTRY_RESULT_INVALID|EFFECT_RECEIPT_ORPHANED/, name);
      assert.equal(harness.received.length, 1, name);
      assert.deepEqual(fs.readFileSync(file), before, name);
      t.diagnostic(`${name}: denied without a second HTTP operation or journal mutation`);
    }
    fs.writeFileSync(file, original);
    const recovered = await harness.subprocess(directory, 'sv_SE.UTF-8');
    assert.equal(recovered.code, 0, recovered.err);
    assert.equal(harness.received.length, 1);
    assert.equal(harness.received[0].rawBody, '{"ä":1,"z":2}');
  } finally { await harness.close(); }
});

test('independent unknown portable dependency version cannot hide behind another valid request subject', async () => {
  const harness = createHarness();
  try {
    const origin = await harness.listen(), directory = harness.fixture('unknown-key-codec', origin);
    const initial = await harness.subprocess(directory, 'en_US.UTF-8');
    assert.equal(initial.signal, 'SIGKILL', initial.err); assert.equal(harness.received.length, 1);
    const file = path.join(directory, 'effects.jsonl'), original = fs.readFileSync(file);
    const rows = original.toString().trim().split('\n').map(line => JSON.parse(line).entry);
    let key, effectId;
    for (const row of rows) if (row.request?.capability === 'network.http') {
      key = row.request.idempotencyKey.replace(':utf16-v1:', ':utf16-v99:');
      assert.notEqual(key, row.request.idempotencyKey);
      row.request.idempotencyKey = key; row.request.payload.body.ä = 999;
      row.request.effectId = stableEffectId(row.request); effectId = row.request.effectId;
    }
    Object.assign(rows.find(row => row.type === 'completed').receipt, {idempotencyKey: key, effectId});
    rewrite(file, rows); const before = fs.readFileSync(file);
    const recovered = await harness.subprocess(directory, 'sv_SE.UTF-8');
    assert.equal(recovered.code, 1, recovered.err);
    assert.match(recovered.err, /ADAPTER_DEPENDENCY_HISTORY_INVALID/);
    assert.equal(harness.received.length, 1); assert.deepEqual(fs.readFileSync(file), before);
    fs.writeFileSync(file, original);
    assert.equal((await harness.subprocess(directory, 'sv_SE.UTF-8')).code, 0);
    assert.equal(harness.received.length, 1);
  } finally { await harness.close(); }
});
