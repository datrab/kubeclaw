import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { PreparationSourceLedger } from '../../../skills/buster/engine/test-gates/preparation-ledger.ts';
import { preparationEnvelope, preparationProfile } from '../../../skills/buster/engine/test-gates/preparation-envelope.ts';
import { NativeAttemptJournal, type NativeAttemptBootAssociation } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import type { BusterPreparationSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

// Boundary tests use the actual authored policy and actual durable stores.
// Denial callbacks are NOT fake native capsules or acceptance of a host/kernel.
const author = JSON.parse(await fs.readFile(new URL('../../../config/components/buster-engine.config.json', import.meta.url), 'utf8'));
const settings: BusterPreparationSettings = author.profiles.standard.settings.preparation;
const profile = preparationProfile(`sha256:${'a'.repeat(64)}`);
const admissionId = '1'.repeat(32);
const now = new Date('2026-10-14T00:00:00Z');
const envelope = preparationEnvelope(admissionId, profile, settings, now, 1003, { kind: 'stage' });
const limits = { maximumRecords: settings.maximumRecords, maximumStateBytes: settings.maximumMetadataBytes,
  maximumTotalBytes: settings.maximumJournalBytes, maximumInputBytes: settings.maximumInputBytes,
  maximumOutputBytes: settings.maximumOutputBytes, maximumResultBytes: settings.maximumResultBytes };
function missing(): NativeAttemptBootAssociation {
  return { bind: async () => { throw new Error('TEST_ORIGINAL_BIND_DENIED'); },
    verify: async () => { throw new Error('TEST_ORIGINAL_VERIFY_DENIED'); } };
}

test('original bind denial precedes the first actual ledger state write', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'original-ledger-denial-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const ledger = new PreparationSourceLedger(root, settings, missing());
  await assert.rejects(ledger.reserve(admissionId, profile, now), /ORIGINAL_BIND_DENIED/);
  await assert.rejects(fs.access(path.join(root, 'source-ledger/state.json')), { code: 'ENOENT' });
  assert.deepEqual(await ledger.reservations(), [], 'failure creates neither a reservation nor a fake original');
});

test('retained ledger rows without original association deny read/retry/mutation without repair', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'original-ledger-retained-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await new PreparationSourceLedger(root, settings).reserve(admissionId, profile, now);
  const file = path.join(root, 'source-ledger/state.json'), before = await fs.readFile(file);
  let binds = 0;
  const ledger = new PreparationSourceLedger(root, settings, { bind: async () => { binds++; }, verify: missing().verify });
  await assert.rejects(ledger.reservations(), /ORIGINAL_VERIFY_DENIED/);
  await assert.rejects(ledger.reserve(admissionId, profile, now), /ORIGINAL_VERIFY_DENIED/);
  await assert.rejects(ledger.released(admissionId), /ORIGINAL_VERIFY_DENIED/);
  assert.equal(binds, 0, 'existing A is not initialized from current B');
  assert.deepEqual(await fs.readFile(file), before);
});

test('original bind denial precedes journal input blob and accepted identity', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'original-journal-denial-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new NativeAttemptJournal(path.join(root, 'journal'), limits, missing());
  await assert.rejects(journal.withAttempt(envelope, async () => assert.fail('unbound admission entered')), /ORIGINAL_BIND_DENIED/);
  assert.equal(await journal.hasAttempt(envelope), false);
  await assert.rejects(fs.access(path.join(root, 'journal/data')), { code: 'ENOENT' });
  const accepted = [];
  for await (const value of journal.acceptedEnvelopes()) accepted.push(value);
  assert.deepEqual(accepted, []);
});

test('retained journal admission requires read-only original verification on replay and recovery', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'original-journal-retained-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'journal');
  await new NativeAttemptJournal(directory, limits).withAttempt(envelope, async () => {});
  const file = path.join(directory, 'metadata/records/store.json'), before = await fs.readFile(file);
  let binds = 0;
  const journal = new NativeAttemptJournal(directory, limits, { bind: async () => { binds++; }, verify: missing().verify });
  await assert.rejects(journal.readResult(envelope), /ORIGINAL_VERIFY_DENIED/);
  await assert.rejects(journal.withAttempt(envelope, async () => assert.fail('unbound replay entered')), /ORIGINAL_VERIFY_DENIED/);
  await assert.rejects(async () => { for await (const _ of journal.acceptedEnvelopes()) assert.fail('unbound recovery yielded'); }, /ORIGINAL_VERIFY_DENIED/);
  assert.equal(binds, 0);
  assert.deepEqual(await fs.readFile(file), before);
});

test('actual inherited-lock original store denies missing A and wrong exact attempt associations', async t => {
  assert.equal(process.getuid?.(), 0, 'genuine root-owned lifetime/store controls, never spoofed');
  const base = await fs.mkdtemp('/dev/original-attempt-store-');
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'original-attempt-runner-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  await fs.mkdir(path.join(base, 'ownership'), { mode: 0o700 });
  const lock = path.join(base, 'lifetime.lock'); await fs.writeFile(lock, '', { mode: 0o600 });
  const runner = path.join(temporary, 'runner.mjs'), input = path.join(temporary, 'envelope.json');
  await fs.writeFile(input, JSON.stringify(envelope));
  await fs.writeFile(runner, `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { captureBusterLifetimeDescriptor } from '${new URL('../../../skills/common/plugin-runtime/foundation/config/buster-lifetime.mjs', import.meta.url).href}';
import { PreparationOriginalBootStore, assertOriginalBusterRecoveryContext, originalActiveBootWireMaximumBytes } from '${new URL('../../../skills/buster/engine/test-gates/preparation-boot-store.ts', import.meta.url).href}';
const base = process.argv[2], envelope = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const lifetime = captureBusterLifetimeDescriptor(base, 9);
try {
 const root = path.join(base, 'ownership');
 const store = new PreparationOriginalBootStore(root, lifetime, 4096);
 const originalBoot = { schemaVersion: 'buster-original-native-boot-archive-reference.v1', parentBootId: '12345678-1234-4123-8123-123456789abc', digest: 'sha256:'+'0'.repeat(64), byteLength: 1, contentByteLength: 1 };
 const binding = store.admissionBinding(originalBoot);
 await assert.rejects(binding.bind(envelope), { code: 'ENOENT' });
 await assert.rejects(binding.verify(envelope), { code: 'ENOENT' });
 assert.throws(() => store.recoveryContext(), { code: 'ENOENT' });
 let forgedCalled = false;
 assert.throws(() => assertOriginalBusterRecoveryContext({ schemaVersion: 'buster-original-native-recovery-context.v1', assertCurrent() { forgedCalled = true; } }), /VERIFIED_RECOVERY_CONTEXT_REQUIRED/);
 assert.equal(forgedCalled, false);
 assert.deepEqual(fs.readdirSync(root), [], 'missing genuine A emits neither association nor current-B capsule');
 const directory = path.join(root, 'original-boots', 'attempts'); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
 const identity = { workerId: envelope.claim.workerId, attemptId: envelope.attemptId, claimId: envelope.claim.claimId, generation: envelope.claim.generation, profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest };
 const key = createHash('sha256').update(JSON.stringify([identity.workerId, identity.attemptId, identity.generation])).digest('hex');
 const file = path.join(directory, key+'.json');
 const write = value => { fs.writeFileSync(file, JSON.stringify(value)); fs.chmodSync(file, 0o444); };
 const row = { schemaVersion: 'buster-original-native-attempt-boot.v1', identity, envelopeDigest: 'sha256:'+'0'.repeat(64), originalBoot };
 write({ ...row, extra: true });
 await assert.rejects(binding.verify(envelope), /RECORD_INVALID/);
 fs.unlinkSync(file); write(row);
 const before = fs.readFileSync(file), inode = fs.statSync(file).ino;
 await assert.rejects(binding.verify(envelope), /ATTEMPT_MISMATCH/);
 await assert.rejects(binding.bind(envelope), { code: 'ENOENT' });
 assert.deepEqual(fs.readFileSync(file), before); assert.equal(fs.statSync(file).ino, inode);
 fs.unlinkSync(file); write({ ...row, identity: { ...identity, claimId: 'foreign-claim' } });
 await assert.rejects(binding.verify(envelope), /ATTEMPT_MISMATCH/);
 const activeFile = path.join(root, 'original-boots', 'active.json');
 const writeActive = bytes => { fs.writeFileSync(activeFile, bytes); fs.chmodSync(activeFile, 0o444); };
 writeActive(JSON.stringify({ schemaVersion: 'buster-original-native-active-boot.v1', originalBoot: {} }));
 // Even a B-sized per-record limit of1 cannot decide the original pointer's
 // closed protocol bound. Malformed content is decoded then rejected, not
 // misclassified as an over-budget current-B record.
 const narrow = new PreparationOriginalBootStore(root, lifetime, 1);
 assert.throws(() => narrow.readActive(), /RECORD_INVALID/);
 assert.throws(() => narrow.recoveryContext(), /RECORD_INVALID/);
 fs.unlinkSync(activeFile); writeActive(' '.repeat(originalActiveBootWireMaximumBytes + 1));
 const activeBytes = fs.readFileSync(activeFile), activeInode = fs.statSync(activeFile).ino;
 assert.throws(() => store.recoveryContext(), /FILE_NOT_TRUSTED/);
 assert.deepEqual(fs.readFileSync(activeFile), activeBytes); assert.equal(fs.statSync(activeFile).ino, activeInode);
} finally { lifetime.close(); }
`);
  execFileSync('/bin/sh', ['-c', 'exec 9<>"$1"; flock -n 9; exec "$2" "$3" "$4" "$5"',
    'original-attempt-controls', lock, process.execPath, runner, base, input], { stdio: 'pipe' });
});
