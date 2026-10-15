import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { originalBootMetadataBytes } from '../../../skills/buster/engine/test-gates/preparation-boot-metadata.ts';
import { FileWorkerOwnershipStore } from '../../../skills/worker/core/worker/ownership-store.ts';
import { ownershipTerminalCapacityBytes } from '../../../skills/worker/core/worker/ownership-capacity.ts';

// Physical accounting fixtures only: names/bytes are NOT authenticated native
// capsules, source receipts or activation/retirement evidence.
const capsule = '12345678-1234-4123-8123-123456789abc.json.gz';
const source = `${'1'.repeat(64)}.json.gz`;
function fixture(t: test.TestContext) {
  assert.equal(process.getuid?.(), 0);
  const parent = fs.mkdtempSync('/dev/original-metadata-test-');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'original-boots');
  const measure = (records = 32, bytes = 1048576, associationBytes = 4096) => originalBootMetadataBytes(root, records, bytes, associationBytes);
  const write = (name: string, length: number) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(root, name), Buffer.alloc(length), { mode: 0o444 });
  };
  return { parent, root, measure, write };
}

test('initial missing namespace is zero only under a genuine present trusted ownership parent', t => {
  const f = fixture(t);
  assert.equal(f.measure(), 0);
  assert.deepEqual(fs.readdirSync(f.parent), [], 'read-only observation creates no namespace');
  assert.throws(() => originalBootMetadataBytes(path.join(f.parent, 'missing/child'), 32, 1048576, 4096), { code: 'ENOENT' });
});

test('capsule, source, active pointer and both association sets all count actual physical bytes', t => {
  const f = fixture(t);
  f.write(capsule, 23); f.write(`sources/${source}`, 31); f.write('active.json', 17);
  f.write(`attempts/${'2'.repeat(64)}.json`, 13);
  f.write(`owners/worker-12345678-1234-4123-8123-123456789abc.json`, 19);
  assert.equal(f.measure(), 103);
  assert.equal(f.measure(32, 103), 103);
  assert.throws(() => f.measure(32, 102), /CAPACITY/);
  assert.throws(() => f.measure(32, 1048576, 16), /FILE_NOT_TRUSTED/);
});

test('unknown/partial/symlink archive state is retained and blocks accounting instead of becoming zero', t => {
  const f = fixture(t); f.write(capsule, 23);
  const partial = path.join(f.root, '.source-closure-interrupted');
  fs.writeFileSync(partial, 'partial', { mode: 0o600 });
  assert.throws(f.measure, /RECORD_INVALID/);
  assert.equal(fs.readFileSync(partial, 'utf8'), 'partial');
  fs.unlinkSync(partial);
  fs.symlinkSync(capsule, path.join(f.root, 'active.json'));
  assert.throws(f.measure, error => (error as NodeJS.ErrnoException).code === 'ELOOP');
  assert.equal(fs.readlinkSync(path.join(f.root, 'active.json')), capsule);
});

test('original archive/source addition competes with existing Core future-terminal reservation', async t => {
  const f = fixture(t);
  const limits = { maximumRecords: 32, maximumBytes: 1048576 };
  await new FileWorkerOwnershipStore(f.parent, limits).reserve({ workerId: 'worker:archive', attemptId: 'attempt:archive',
    claimId: 'claim:archive', generation: 1, profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` });
  const state = JSON.parse(fs.readFileSync(path.join(f.parent, 'owners.json'), 'utf8'));
  const future = ownershipTerminalCapacityBytes(state);
  const store = new FileWorkerOwnershipStore(f.parent, { ...limits, maximumBytes: future + 54 }, f.measure);
  let emitted = false;
  await assert.rejects(store.withMetadataReservation(55, () => { emitted = true; }), /CAPACITY/);
  assert.equal(emitted, false);
  assert.equal(fs.existsSync(f.root), false);
  await store.withMetadataReservation(54, () => { f.write(capsule, 23); f.write(`sources/${source}`, 31); });
  assert.equal(f.measure(), 54);
  await assert.rejects(store.withMetadataReservation(1, () => assert.fail('archive bytes lost from accounting')), /CAPACITY/);
  assert.equal(f.measure(), 54);
});
