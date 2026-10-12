import assert from 'node:assert/strict';
import test from 'node:test';
import { assertHistoricalImportDescriptor, assertHistoricalImportReceipt } from '../../../skills/buster/engine/test-gates/preparation-historical-reference.ts';
import { assertHistoricalImmutableTreeObservation, assertHistoricalImmutableRuntimeObservation } from '../../../skills/buster/engine/test-gates/preparation-historical-source.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const descriptor = { schemaVersion: 'buster-historical-import-descriptor.v1', originalStoreDigest: digest,
  originalStoreBytes: 100, originalStoreDevice: 1, originalStoreInode: 2 };
const receipt = { schemaVersion: 'buster-historical-import-receipt.v1', importId: 'a'.repeat(32), descriptor,
  preparationUid: 1003, attemptSpecDigest: digest, recordCount: 1, wireCount: 1, wireBytes: 100,
  manifestDigest: digest, initialV2StoreDigest: digest, nativeResultDigest: digest };
const filesystemUuid = '00000000-0000-4000-8000-000000000001';
const observation = { filesystemUuid, schemaVersion: 'buster-legacy-immutable-tree.v1', device: 1, inode: 3, mountId: 4,
  inventoryDigest: digest, store: { device: 1, inode: 2, bytes: 100, digest },
  bytes: 100, entries: 3, resultBytes: 0, resultEntries: 0 };

// Decoder-only fixtures: neither these values nor a checksum authorizes migration.
for (const row of [
  { name: 'historical descriptor', value: descriptor, validate: assertHistoricalImportDescriptor,
    fields: ['originalStoreDigest', 'originalStoreBytes', 'originalStoreDevice', 'originalStoreInode'] },
  { name: 'historical group receipt', value: receipt, validate: assertHistoricalImportReceipt,
    fields: ['importId', 'attemptSpecDigest', 'manifestDigest', 'initialV2StoreDigest', 'nativeResultDigest', 'recordCount', 'wireCount', 'wireBytes'] },
  { name: 'immutable observation', value: observation,
    validate: (value: unknown) => assertHistoricalImmutableTreeObservation(value, 100, 3),
    fields: ['filesystemUuid', 'inventoryDigest', 'device', 'inode', 'mountId', 'bytes', 'entries', 'resultBytes', 'resultEntries'] },
]) {
  test(`${row.name} accepts its exact shape and refuses JSON identity coercion`, () => {
    assert.doesNotThrow(() => row.validate(row.value));
    for (const field of row.fields) {
      const value = row.value as Record<string, unknown>;
      for (const replacement of [[value[field]], null, {}, true]) {
        assert.throws(() => row.validate({ ...value, [field]: replacement }), /BUSTER_HISTORICAL/);
      }
    }
    assert.throws(() => row.validate({ ...row.value, extra: true }), /BUSTER_HISTORICAL/);
  });
}
test('immutable observation refuses nested coercion, inconsistent totals and insufficient caller limits', () => {
  for (const field of ['device','inode','bytes','digest']) {
    const store = observation.store as Record<string, unknown>;
    assert.throws(() => assertHistoricalImmutableTreeObservation({ ...observation,
      store: { ...store, [field]: [store[field]] } }, 100, 3), /BUSTER_HISTORICAL/);
  }
  assert.throws(() => assertHistoricalImmutableTreeObservation(observation, 99, 3), /BUSTER_HISTORICAL/);
  assert.throws(() => assertHistoricalImmutableTreeObservation(observation, 100, 2), /BUSTER_HISTORICAL/);
  assert.throws(() => assertHistoricalImmutableTreeObservation({ ...observation, resultBytes: 101 }, 100, 3), /BUSTER_HISTORICAL/);
});

test('runtime observation has its own UUID-bound shape and cannot masquerade as plan evidence', () => {
  const runtime = { schemaVersion: 'buster-legacy-immutable-runtime.v1', filesystemUuid,
    device: 1, inode: 5, mountId: 4, inventoryDigest: digest, bytes: 0, entries: 1 };
  assert.doesNotThrow(() => assertHistoricalImmutableRuntimeObservation(runtime, 1, 1));
  assert.throws(() => assertHistoricalImmutableTreeObservation(runtime, 1, 1), /BUSTER_HISTORICAL/);
  assert.throws(() => assertHistoricalImmutableRuntimeObservation(observation, 100, 3), /BUSTER_HISTORICAL/);
  for (const invalid of [[filesystemUuid], '', null, '00000000-0000-0000-0000-000000000000']) {
    assert.throws(() => assertHistoricalImmutableRuntimeObservation({ ...runtime, filesystemUuid: invalid }, 1, 1), /BUSTER_HISTORICAL/);
  }
});
