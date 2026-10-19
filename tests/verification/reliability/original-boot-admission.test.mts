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
import { gzipSync } from 'node:zlib';
import { portableJson } from '${new URL('../../../skills/common/plugin-runtime/sdk/src/values.ts', import.meta.url).href}';
import { captureWorkerCorePolicy } from '${new URL('../../../skills/common/plugin-runtime/foundation/config/worker-core-policy.ts', import.meta.url).href}';
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
 // Versioned capsule negatives never grant native authority or fabricate A.
 // Reject mixed facts/policy wires BEFORE attempting any original source read.
 const capsuleFile = path.join(root, 'original-boots', originalBoot.parentBootId+'.json.gz');
 for (const [capsuleVersion, factsVersion, native, error] of [
   ['v1', 'v1', { workerCore: {} }, /RECORD_INVALID/],
   ['v2', 'v1', { workerCore: {} }, /RECORD_INVALID/],
   ['v2', 'v2', {}, /RECORD_INVALID/],
   ['v2', 'v2', { workerCore: {} }, /WORKER_CORE_CAPTURE_INVALID/],
 ]) {
   const content = Buffer.from(JSON.stringify({ schemaVersion: 'buster-original-native-boot-capsule.'+capsuleVersion,
     handoff: { parentBootId: originalBoot.parentBootId }, sourceArchive: {},
     facts: { schemaVersion: 'buster-native-boot-facts.'+factsVersion, native } }));
   const bytes = gzipSync(content);
   fs.writeFileSync(capsuleFile, bytes); fs.chmodSync(capsuleFile, 0o444);
   const reference = { ...originalBoot, digest: 'sha256:'+createHash('sha256').update(bytes).digest('hex'),
     byteLength: bytes.byteLength, contentByteLength: content.byteLength };
   assert.throws(() => store.read(reference), error);
   assert.deepEqual(fs.readFileSync(capsuleFile), bytes, 'wire denial never repairs original state');
   fs.unlinkSync(capsuleFile);
 }
 // Wire-level archive join only: no fabricated native host or activation.
 // Even fully rehashed, schema-valid policy B cannot replace archived A.
 const digest = value => 'sha256:'+createHash('sha256').update(value).digest('hex');
 const owner = JSON.parse(fs.readFileSync('${new URL('../../../config/components/worker-core.config.json', import.meta.url).pathname}', 'utf8'));
 const selectedCore = captureWorkerCorePolicy(owner.profiles.standard.settings);
 const coreBinding = { owner: 'worker-core', instanceId: 'test/buster', profileId: 'standard' };
 const selectionBody = { schemaVersion: 'pipeline-service-selection.v1', role: 'buster',
   callerId: 'buster-preparation', serviceInstanceId: 'test/buster', generationDigest: 'sha256:'+'a'.repeat(64),
   packageReceiptDigest: digest(JSON.stringify({ schemaVersion: 'pipeline-runtime-bundle.v2', files: [] })),
   bindings: [{ owner: 'buster-engine', instanceId: 'test/buster', profileId: 'standard' }, coreBinding] };
 const selection = { ...selectionBody, digest: digest(portableJson(selectionBody)) };
 const imageBytes = JSON.stringify({ wireFixture: 'image' });
 const expected = { schemaVersion: 'pipeline-expected-delivery.v1', callerId: 'buster-preparation', role: 'buster',
   serviceInstanceId: 'test/buster', generationDigest: selection.generationDigest, selectionDigest: selection.digest,
   packageReceiptDigest: selection.packageReceiptDigest, imageReceiptDigest: digest(imageBytes) };
 const members = {
   'generation/pipeline.config.json': JSON.stringify({ components: { 'worker-core': 'components/worker-core.config.json' }, bindings: [{ role: 'buster', ...coreBinding }] }),
   'generation/components/worker-core.config.json': JSON.stringify(owner),
   'generation/selections/buster-preparation.json': JSON.stringify(selection),
   'generation/selections/buster-runtime.json': '{}',
   'generation/package-receipt.json': JSON.stringify({ schemaVersion: 'pipeline-runtime-bundle.v2', files: [] }),
   'generation/image-receipt.json': imageBytes,
   'reader/swarm.ts': 'wire fixture', 'reader/swarm.schema.json': '{}',
 };
 const sourceContent = Buffer.from(JSON.stringify({ schemaVersion: 'buster-boot-source-closure.v2',
   expectedReceipt: expected, installedPackageRoot: '/wire-fixture-only', files: Object.entries(members).map(([name, content]) => ({
     name, digest: digest(content), byteLength: Buffer.byteLength(content), bytes: Buffer.from(content).toString('base64') })) }));
 const sourceBytes = gzipSync(sourceContent), sourceDirectory = path.join(root, 'original-boots', 'sources');
 fs.mkdirSync(sourceDirectory, { mode: 0o700 });
 const sourceFile = path.join(sourceDirectory, selection.generationDigest.slice(7)+'.json.gz');
 fs.writeFileSync(sourceFile, sourceBytes, { mode: 0o444 });
 const sourceArchive = { schemaVersion: 'buster-boot-source-archive-receipt.v2', file: sourceFile,
   digest: digest(sourceBytes), byteLength: sourceBytes.byteLength, contentByteLength: sourceContent.byteLength,
   generationDigest: selection.generationDigest };
 const alteredCore = structuredClone(selectedCore);
 alteredCore.settings.runtime.node_identity_file_bytes = 64;
 for (const [core, denied] of [[selectedCore, false], [alteredCore, true]]) {
   const content = Buffer.from(JSON.stringify({ schemaVersion: 'buster-original-native-boot-capsule.v2',
     handoff: { parentBootId: originalBoot.parentBootId, parentSelection: selection, imageReceiptDigest: expected.imageReceiptDigest }, sourceArchive,
     facts: { schemaVersion: 'buster-native-boot-facts.v2', generationDigest: expected.generationDigest,
       selectionDigest: expected.selectionDigest, packageReceiptDigest: expected.packageReceiptDigest,
       imageReceiptDigest: expected.imageReceiptDigest, native: { workerCore: core } } }));
   const bytes = gzipSync(content);
   fs.writeFileSync(capsuleFile, bytes, { mode: 0o444 });
   const reference = { ...originalBoot, digest: digest(bytes), byteLength: bytes.byteLength, contentByteLength: content.byteLength };
   if (denied) assert.throws(() => store.read(reference), /CORE_SOURCE_MISMATCH/);
   else assert.deepEqual(store.read(reference).facts.native.workerCore, selectedCore);
   assert.deepEqual(fs.readFileSync(capsuleFile), bytes);
   fs.unlinkSync(capsuleFile);
 }

} finally { lifetime.close(); }
`);
  execFileSync('/bin/sh', ['-c', 'exec 9<>"$1"; flock -n 9; exec "$2" "$3" "$4" "$5"',
    'original-attempt-controls', lock, process.execPath, runner, base, input], { stdio: 'pipe' });
});
