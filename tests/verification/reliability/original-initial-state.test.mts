import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { retainEmptyPreparationDirectory, retainUninitializedOwnershipDirectory } from '../../../skills/buster/engine/test-gates/preparation-empty-directory.ts';
import { FileWorkerOwnershipStore } from '../../../skills/worker/core/worker/ownership-store.ts';

// Genuine root-owned physical directories; no forged native facts, pool,
// publication, host installation or INITIAL activation is claimed here.
function fixture(t: test.TestContext) {
  assert.equal(process.getuid?.(), 0);
  const root = fs.mkdtempSync('/dev/original-initial-state-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownership = path.join(root, 'ownership'); fs.mkdirSync(ownership, { mode: 0o700 });
  return { root, ownership };
}
function writeLock(file: string) { fs.writeFileSync(file, '', { mode: 0o600 }); }

test('pristine proof rechecks inside the actual Core metadata fence before publication effects', async t => {
  const { ownership } = fixture(t);
  const capture = retainUninitializedOwnershipDirectory(ownership); t.after(capture.close);
  const store = new FileWorkerOwnershipStore(ownership, { maximumRecords: 10, maximumBytes: 65536 });
  let entered = false;
  await store.withMetadataReservation(128, () => { capture.assertCurrent(); entered = true; });
  assert.equal(entered, true);
  assert.deepEqual(fs.readdirSync(ownership), ['.write-lock']);
  // Retained rows must deny even if owners.json is absent and the same genuine
  // Core lock is successfully reacquired. Nothing is deleted/repaired.
  fs.mkdirSync(path.join(ownership, 'original-boots'));
  entered = false;
  await assert.rejects(store.withMetadataReservation(128, () => {
    capture.assertCurrent(); entered = true;
  }), /PRIOR_STATE_UNACCOUNTED/);
  assert.equal(entered, false);
  assert.deepEqual(fs.readdirSync(ownership).sort(), ['.write-lock', 'original-boots']);
});

test('pristine ownership capture tolerates genuine fence creation, but never original residue', t => {
  const { ownership } = fixture(t);
  const capture = retainUninitializedOwnershipDirectory(ownership);
  t.after(capture.close);
  writeLock(path.join(ownership, '.write-lock'));
  const supervisor = path.join(ownership, 'supervisor'); fs.mkdirSync(supervisor, { mode: 0o700 });
  writeLock(path.join(supervisor, '.write-lock'));
  capture.assertCurrent();
  const orphan = path.join(ownership, 'original-boots'); fs.mkdirSync(orphan, { mode: 0o700 });
  assert.throws(capture.assertCurrent, /PRIOR_STATE_UNACCOUNTED/);
  assert.deepEqual(fs.readdirSync(orphan), [], 'even an empty prior archive namespace is retained and denied');
});

test('missing active A with any legacy store denies pristine classification without mutation', t => {
  const { ownership } = fixture(t);
  for (const name of ['owners.json', 'journal', 'original-boots', 'partial-publication']) {
    const file = path.join(ownership, name);
    fs.writeFileSync(file, ''); const before = fs.statSync(file);
    assert.throws(() => retainUninitializedOwnershipDirectory(ownership), /PRIOR_STATE_UNACCOUNTED/);
    assert.equal(fs.statSync(file).ino, before.ino);
    assert.equal(fs.readFileSync(file).byteLength, 0);
    fs.unlinkSync(file);
  }
});

test('fence-shaped symlinks, hard links, unsafe modes and data are not pristine state', t => {
  const { root, ownership } = fixture(t);
  const file = path.join(ownership, '.write-lock'), outside = path.join(root, 'outside'); writeLock(outside);
  fs.symlinkSync(outside, file);
  assert.throws(() => retainUninitializedOwnershipDirectory(ownership), { code: 'ELOOP' });
  fs.unlinkSync(file); fs.linkSync(outside, file);
  assert.throws(() => retainUninitializedOwnershipDirectory(ownership), /PRIOR_STATE_UNACCOUNTED/);
  fs.unlinkSync(file); writeLock(file); fs.chmodSync(file, 0o644);
  assert.throws(() => retainUninitializedOwnershipDirectory(ownership), /PRIOR_STATE_UNACCOUNTED/);
  fs.chmodSync(file, 0o600); fs.writeFileSync(file, 'retained');
  assert.throws(() => retainUninitializedOwnershipDirectory(ownership), /PRIOR_STATE_UNACCOUNTED/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'retained');
});

test('supervisor namespace never conceals prior rows or a substituted directory', t => {
  const { root, ownership } = fixture(t);
  const supervisor = path.join(ownership, 'supervisor'); fs.mkdirSync(supervisor, { mode: 0o700 });
  writeLock(path.join(supervisor, '.write-lock'));
  const capture = retainUninitializedOwnershipDirectory(ownership); t.after(capture.close);
  fs.writeFileSync(path.join(supervisor, 'lifetime'), '');
  assert.throws(capture.assertCurrent, /PRIOR_STATE_UNACCOUNTED/);
  fs.rmSync(supervisor, { recursive: true });
  fs.symlinkSync(root, supervisor);
  assert.throws(capture.assertCurrent);
});

test('pristine PVC capture denies missing, changed, populated and closed physical stores', t => {
  const { root } = fixture(t), volume = path.join(root, 'volume');
  assert.throws(() => retainEmptyPreparationDirectory(volume), { code: 'ENOENT' });
  fs.mkdirSync(volume, { mode: 0o755 });
  const capture = retainEmptyPreparationDirectory(volume); t.after(capture.close);
  fs.writeFileSync(path.join(volume, 'retained'), '');
  assert.throws(capture.assertCurrent, /PRIOR_STATE_UNACCOUNTED/);
  fs.unlinkSync(path.join(volume, 'retained'));
  fs.renameSync(volume, `${volume}-prior`); fs.mkdirSync(volume, { mode: 0o755 });
  assert.throws(capture.assertCurrent, /DIRECTORY_CHANGED/);
  capture.close(); capture.close();
  assert.throws(capture.assertCurrent, /CAPTURE_CLOSED/);
});
