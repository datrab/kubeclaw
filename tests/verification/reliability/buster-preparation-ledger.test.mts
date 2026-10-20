import { canonicalPipelineEntry, readTestPipeline, writeTestPipeline, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { workerAttemptSpecDigest } from '@kubeclaw/worker-core';
import { attestSourceSnapshot } from '@kubeclaw/pipeline-test-gate-contract';
import { createRemotePlanJob } from '@kubeclaw/nova-core';
import { plan } from '../../fixtures/test-gate/remote-plan.mts';
import { preparedPlanHeader, preparationDigest } from '../../../skills/buster/engine/test-gates/preparation-header.ts';
import type { StagedAdmission } from '../../../skills/buster/engine/test-gates/preparation-input.ts';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureSwarmSettings, type BusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { PreparationSourceLedger } from '../../../skills/buster/engine/test-gates/preparation-ledger.ts';
import { preparationProfile } from '../../../skills/buster/engine/test-gates/preparation-envelope.ts';
import { withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';

const settings = (captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
const profile = preparationProfile(`sha256:${'a'.repeat(64)}`);
const now = new Date('2026-09-21T00:00:00.000Z');
const id = (value: number) => value.toString(16).padStart(32, '0');


// Contract-valid staged identity only; this fixture is not owned/native archive evidence.
function stagedInput(): StagedAdmission {
  const archive = Buffer.from('ledger identity fixture');
  const key = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  const digest = `sha256:${'f'.repeat(64)}`;
  const snapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
    pipelineStageId: 'stage:ledger', repositoryId: 'repository:ledger', revision: `git:${'a'.repeat(40)}`,
    tree: `git:${'b'.repeat(40)}`, archiveContentDigest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`,
    archiveSizeBytes: archive.length, creatorAuthority: 'nova:ledger' }, key);
  const job = preparedPlanHeader(createRemotePlanJob({ idempotencyKey: 'ledger:1', pipelineStageId: 'stage:ledger',
    plan: plan('blocking', null), sourceSnapshot: snapshot, repositoryArchive: archive,
    grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: now.toISOString() }));
  return { job, input: { schemaVersion: 'buster-staged-input.v1', admissionId: id(1), preparationUid: 1003,
    jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(job),
    wireDigest: digest, wireBytes: 100, attemptSpecDigest: digest } };
}

async function fixture(recordLimit = settings.maximumRecords) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-preparation-ledger-'));
  const configured = readTestPipeline();
  configured['buster-engine'].profiles.runtime.settings.preparation.maximumRecords = recordLimit;
  const configFile = path.join(root, 'pipeline.config.json');
  writeTestPipeline(configFile, configured);
  const policy = (captureSwarmSettings(configFile, busterRuntimeSelection(configured)).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
  return { root, file: path.join(root, 'source-ledger', 'state.json'),
    ledger: new PreparationSourceLedger(root, policy), dispose: () => fs.rm(root, { recursive: true, force: true }) };
}

test('real ledger serializes competing admissions into exactly two fixed slots', async () => {
  const f = await fixture();
  try {
    const attempts = await Promise.allSettled([1, 2, 3].map(value => f.ledger.reserve(id(value), profile, now)));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 2);
    const records = await f.ledger.reservations();
    assert.deepEqual(records.map(record => record.slot).sort(), [1003, 1004]);
    const rejected = attempts.find(result => result.status === 'rejected');
    assert.match(String(rejected?.status === 'rejected' && rejected.reason), /SLOT_CAPACITY/);
    assert.equal(records.every(record => record.slotReleased === false), true);
  } finally { await f.dispose(); }
});

test('admission reserves a future cleanup record inside the original record quota', async () => {
  const f = await fixture(2);
  try {
    const accepted = await f.ledger.reserve(id(1), profile, now);
    const before = await fs.readFile(f.file);
    await assert.rejects(f.ledger.reserve(id(2), profile, now), /SOURCE_CAPACITY/);
    assert.deepEqual(await fs.readFile(f.file), before);
    assert.deepEqual(await f.ledger.reserve(id(1), profile, now), accepted);
    await assert.rejects(f.ledger.released(id(1)), /LEDGER_INVALID/,
      'a release without either a sealed cleanup or exact empty-gate proof is rejected');
    assert.deepEqual(await fs.readFile(f.file), before);
  } finally { await f.dispose(); }
});

test('profile, clock and settings ownership is captured before waiting on a real writer lock', async () => {
  const f = await fixture();
  try {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const writer = withDurableStoreLock(f.file, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const submitted = structuredClone(profile);
    const submittedAt = new Date(now);
    const pending = f.ledger.reserve(id(1), submitted, submittedAt);
    submitted.profileId = 'caller-mutated';
    submittedAt.setFullYear(2040);
    release.resolve();
    await writer;
    const accepted = await pending;
    assert.equal(accepted.profile.profileId, profile.profileId);
    assert.equal(accepted.issuedAt, now.toISOString());
  } finally { await f.dispose(); }
});

test('malformed persisted cleanup association is rejected without rewriting bytes', async () => {
  const f = await fixture();
  try {
    await f.ledger.reserve(id(1), profile, now);
    const state = JSON.parse(await fs.readFile(f.file, 'utf8'));
    state.reservations[0].cleanup = [{ envelope: { forged: true } }];
    await fs.writeFile(f.file, JSON.stringify(state));
    const malformed = await fs.readFile(f.file);
    await assert.rejects(f.ledger.reservations(), /CLEANUP_ASSOCIATION_INVALID/);
    assert.deepEqual(await fs.readFile(f.file), malformed);
  } finally { await f.dispose(); }
});


test('real durable lock obeys explicit wait seconds, preserves original state and recovers after timeout', async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let invoked = false;
  const writer = withDurableStoreLock(f.file, async () => {
    await fs.writeFile(f.file, 'original-state');
    entered.resolve(); await release.promise;
  });
  try {
    await entered.promise;
    const started = performance.now();
    await assert.rejects(withDurableStoreLock(f.file, async () => { invoked = true; }, 1), /OBSERVABILITY_STORE_LOCK_FAILED/);
    assert.ok(performance.now() - started < 4000, 'the explicit one-second wait must not use the legacy five-second wait');
    assert.equal(invoked, false);
    assert.equal(await fs.readFile(f.file, 'utf8'), 'original-state');
  } finally { release.resolve(); await writer; }
  try {
    await withDurableStoreLock(f.file, async () => { invoked = true; }, 1);
    assert.equal(invoked, true);
    assert.equal(await fs.readFile(f.file, 'utf8'), 'original-state');
    const absent = path.join(f.root, 'must-not-create', 'state.json');
    for (const wait of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(withDurableStoreLock(absent, async () => { throw new Error('unexpected-operation'); }, wait), /OBSERVABILITY_STORE_LOCK_WAIT_INVALID/);
    }
    await assert.rejects(fs.stat(path.dirname(absent)), { code: 'ENOENT' });
  } finally { await f.dispose(); }
});

// Real durable source admission/readback, not native installation or source authority.
test('explicit v10 ledger captures complete A/B authors, replays original envelopes and rejects mixed versions', async () => {
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  for (const selected of ['local-A', 'local-B']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-ledger-v10-'));
    try {
      const author = structuredClone(retained.profiles[selected].settings.preparation);
      const v10Profile = preparationProfile(`sha256:${'a'.repeat(64)}`, 'v10');
      const ledger = new PreparationSourceLedger(root, author, undefined, 'v10');
      const originalAuthor = structuredClone(author);
      author.attemptLogBytes += 1;
      const envelope = await ledger.reserve(id(1), v10Profile, now);
      assert.deepEqual(envelope.operation.values.settings, originalAuthor);
      assert.equal(envelope.operation.contractId, 'kubeclaw.buster-preparation@2');
      assert.equal(envelope.limits.logBytes, originalAuthor.attemptLogBytes);
      const file = path.join(root, 'source-ledger', 'state.json');
      const before = await fs.readFile(file);
      const changed = { ...originalAuthor, attemptLogBytes: originalAuthor.attemptLogBytes + 1 };
      const reopened = new PreparationSourceLedger(root, changed, undefined, 'v10');
      assert.deepEqual(await reopened.reserve(id(1), v10Profile, now), envelope, 'replay must use original A, not current B');
      assert.deepEqual((await reopened.reservations())[0]!.envelope, envelope);
      assert.deepEqual(await fs.readFile(file), before);
      // A constructor-selected codec may not reinterpret a retained opposite
      // generation, even if the shared ledger envelope itself is well formed.
      const legacyReader = new PreparationSourceLedger(root, settings);
      await assert.rejects(legacyReader.reservations(), /LEDGER_VERSION_MISMATCH/);
      await assert.rejects(legacyReader.reserve(id(1), profile, now), /LEDGER_VERSION_MISMATCH/);
      await assert.rejects(legacyReader.released(id(1)), /LEDGER_VERSION_MISMATCH/);
      assert.deepEqual(await fs.readFile(file), before, 'opposite-codec reads and writes preserve original v10 bytes');
      const legacyRoot = path.join(root, 'legacy-original');
      const originalLegacy = new PreparationSourceLedger(legacyRoot, settings);
      const legacyEnvelope = await originalLegacy.reserve(id(1), profile, now);
      const legacyFile = path.join(legacyRoot, 'source-ledger', 'state.json');
      const legacyBytes = await fs.readFile(legacyFile);
      const v10Reader = new PreparationSourceLedger(legacyRoot, originalAuthor, undefined, 'v10');
      await assert.rejects(v10Reader.reservations(), /LEDGER_VERSION_MISMATCH/);
      await assert.rejects(v10Reader.reserve(id(1), v10Profile, now), /LEDGER_VERSION_MISMATCH/);
      await assert.rejects(v10Reader.released(id(1)), /LEDGER_VERSION_MISMATCH/);
      assert.deepEqual(await fs.readFile(legacyFile), legacyBytes, 'opposite-codec access preserves legacy bytes');
      assert.deepEqual(await originalLegacy.reserve(id(1), profile, now), legacyEnvelope, 'restored original legacy reader');
      assert.deepEqual(await reopened.reserve(id(1), v10Profile, now), envelope, 'restored original v10 reader');
      await assert.rejects(ledger.reserve(id(2), profile, now), /PROFILE_VERSION_MISMATCH/);
      assert.deepEqual(await fs.readFile(file), before);
      await assert.rejects(ledger.reserveHistorical(id(2), v10Profile, now, {} as never), /V10_HISTORICAL_UNSUPPORTED/);
      assert.deepEqual(await fs.readFile(file), before);
      assert.throws(() => new PreparationSourceLedger(root, originalAuthor), /PREPARATION_INVALID/);
      const missing = { ...originalAuthor }; delete missing.storeLockWaitSeconds;
      assert.throws(() => new PreparationSourceLedger(root, missing, undefined, 'v10'), /V10_INVALID/);
      assert.throws(() => new PreparationSourceLedger(root, settings, undefined, 'v10'), /V10_INVALID/);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  }
});

test('every v10 ledger operation obeys its captured lock wait before mutation and restores after contention', async () => {
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-ledger-lock-v10-'));
  const file = path.join(root, 'source-ledger', 'state.json');
  const author = { ...retained.profiles['local-A'].settings.preparation, storeLockWaitSeconds: 1 };
  const ledger = new PreparationSourceLedger(root, author, undefined, 'v10');
  author.storeLockWaitSeconds = 10;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writer = withDurableStoreLock(file, async () => { entered.resolve(); await release.promise; });
  try {
    await entered.promise;
    const v10Profile = preparationProfile(`sha256:${'a'.repeat(64)}`, 'v10');
    const started = performance.now();
    const results = await Promise.allSettled([
      ledger.reserve(id(1), v10Profile, now), ledger.reservations(), ledger.released(id(1)),
      ledger.reserveExtraction(id(2), stagedInput(), v10Profile, now),
    ]);
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      assert.match(String(result.status === 'rejected' && result.reason), /OBSERVABILITY_STORE_LOCK_FAILED/);
    }
    assert.ok(performance.now() - started < 4000, 'all lock paths use captured one-second author, not legacy or mutated wait');
    await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  } finally { release.resolve(); await writer; }
  try {
    const accepted = await ledger.reserve(id(1), preparationProfile(`sha256:${'a'.repeat(64)}`, 'v10'), now);
    assert.equal((await ledger.reservations())[0]!.attemptSpecDigest, accepted.attemptSpecDigest);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


test('v10 ledger retains original staged bytes and explicit extraction generation without rewriting malformed recovery', async () => {
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-ledger-extract-v10-'));
  try {
    const settings = retained.profiles['local-A'].settings.preparation;
    const ledger = new PreparationSourceLedger(root, settings, undefined, 'v10');
    const profile = preparationProfile(`sha256:${'a'.repeat(64)}`, 'v10');
    const staged = stagedInput();
    const admitted = await ledger.reserve(id(1), profile, now);
    const input = { ...staged, input: { ...staged.input, attemptSpecDigest: admitted.attemptSpecDigest } };
    await ledger.bindGate(id(1), { preparationUid: 1003, device: 1, inode: 2, markerDigest: `sha256:${'f'.repeat(64)}` });
    await ledger.stageInput(input);
    await ledger.retainInput(input);
    const extraction = await ledger.reserveExtraction(id(2), input, profile, now);
    assert.equal(extraction.operation.contractId, 'kubeclaw.buster-preparation@2');
    assert.deepEqual(extraction.operation.values.phase, { kind: 'extract', input: input.input });
    const records = await ledger.reservations();
    assert.equal(records[1]!.extractionGeneration, 1);
    assert.deepEqual(records[0]!.envelope, admitted);
    assert.deepEqual(records[0]!.input, input);
    assert.deepEqual(await ledger.reserveExtraction(id(3), input, profile, now), extraction);
    const file = path.join(root, 'source-ledger', 'state.json');
    const valid = await fs.readFile(file);
    for (const mutate of [
      (state: any) => { state.reservations[1].envelope.operation.inputSchemaId = 'buster-preparation-input.v1'; },
      (state: any) => { delete state.reservations[1].envelope.operation.values.settings.attemptLogBytes; },
      (state: any) => { state.reservations[1].envelope.operation.contractId = 'foreign-preparation@1'; },
    ]) {
      const state = JSON.parse(valid.toString()); mutate(state);
      // Recompute the public content digest to exercise the receiving codec,
      // not merely the generic envelope-integrity guard (no authority claimed).
      const record = state.reservations[1];
      record.envelope.attemptSpecDigest = workerAttemptSpecDigest(record.envelope);
      record.attemptSpecDigest = record.envelope.attemptSpecDigest;
      await fs.writeFile(file, JSON.stringify(state));
      const malformed = await fs.readFile(file);
      await assert.rejects(ledger.reservations(), /OPERATION|V10_INVALID/);
      assert.deepEqual(await fs.readFile(file), malformed);
    }
    await fs.writeFile(file, valid);
    assert.deepEqual(await ledger.reservations(), records);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
