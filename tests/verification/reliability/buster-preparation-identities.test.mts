import { spawnSync } from 'node:child_process';
import { safeExtract } from '../../../skills/buster/engine/test-gates/preparation-archive.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stagedInputMetadata } from '../../../skills/buster/engine/test-gates/preparation-input.ts';
import { preparedSourceMetadata } from '../../../skills/buster/engine/test-gates/preparation-source.ts';
import { canonicalPipelineEntry, readTestPipeline, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { attestSourceSnapshot } from '@kubeclaw/pipeline-test-gate-contract';
import { createRemotePlanJob } from '@kubeclaw/nova-core';
import { plan } from '../../fixtures/test-gate/remote-plan.mts';
import { assertPreparedSourceShape, preparedPlanHeader, preparationDigest } from '../../../skills/buster/engine/test-gates/preparation-header.ts';
import { assertStagedInput, type BusterInputReference } from '../../../skills/buster/engine/test-gates/preparation-input.ts';
import { assertPreparationCleanupEffects } from '../../../skills/buster/engine/test-gates/preparation-cleanup-binding.ts';

import { captureSwarmSettings, type BusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { preparationEnvelope, preparationProfile } from '../../../skills/buster/engine/test-gates/preparation-envelope.ts';
import { initialSourceReservation, validateSourceLedger, type SourceReservation } from '../../../skills/buster/engine/test-gates/preparation-ledger-state.ts';

// Decoder-only fixture. These bytes are not claimed to be an extracted archive.
const archive = Buffer.from('source identity decoder fixture');
const archiveDigest = `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`;
const key = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
const snapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
  pipelineStageId: 'stage:test', repositoryId: 'repository:test', revision: `git:${'a'.repeat(40)}`,
  tree: `git:${'b'.repeat(40)}`, archiveContentDigest: archiveDigest,
  archiveSizeBytes: archive.length, creatorAuthority: 'nova:test' }, key);
const fullJob = createRemotePlanJob({ idempotencyKey: 'identity-test', pipelineStageId: 'stage:test',
  plan: plan('blocking', null), sourceSnapshot: snapshot, repositoryArchive: archive,
  grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-09-21T00:00:00.000Z' });
const job = preparedPlanHeader(fullJob);
const digest = `sha256:${'f'.repeat(64)}`;
const source = { schemaVersion: 'buster-prepared-source.v1', admissionId: 'a'.repeat(32), preparationUid: 1003,
  jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(job),
  archiveDigest, archiveBytes: archive.length, attemptSpecDigest: digest };
const input = { schemaVersion: 'buster-staged-input.v1', admissionId: source.admissionId,
  preparationUid: 1003, jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(job),
  wireDigest: digest, wireBytes: 100, attemptSpecDigest: digest };
const effects = { schemaVersion: 'buster-preparation-cleanup-effects.v1', admissionId: source.admissionId,
  originalEnvelopeDigest: digest, gate: { preparationUid: 1003, device: 1, inode: 2, markerDigest: digest }, data: null };

for (const item of [
  { name: 'prepared source', value: source, validate: assertPreparedSourceShape,
    fields: ['admissionId', 'jobId', 'requestDigest', 'headerDigest', 'archiveDigest', 'attemptSpecDigest'] },
  { name: 'staged input', value: input, validate: (value: unknown) => assertStagedInput(value, job),
    fields: ['admissionId', 'wireDigest', 'attemptSpecDigest', 'headerDigest', 'requestDigest', 'jobId'] },
  { name: 'cleanup effects', value: effects, validate: assertPreparationCleanupEffects,
    fields: ['admissionId', 'originalEnvelopeDigest'] },
]) {
  test(`${item.name} accepts valid identity and rejects JSON scalar coercion`, () => {
    assert.doesNotThrow(() => item.validate(item.value));
    for (const field of item.fields) {
      const original = (item.value as Record<string, unknown>)[field];
      for (const malformed of [[original], null, true, 1, {}, []]) {
        assert.throws(() => item.validate({ ...item.value, [field]: malformed }), `${item.name}.${field}`);
      }
    }
  });
}

test('cleanup gate digest cannot be coerced from a JSON array', () => {
  assert.throws(() => assertPreparationCleanupEffects({ ...effects,
    gate: { ...effects.gate, markerDigest: [digest] } }), /CLEANUP_EFFECTS_INVALID/);
});

// Decoder-only recovery binding: filesystem ownership and execution are not modeled as proof.
test('recovered source reference remains bound to the originally accepted extraction header', () => {
  const settings = (captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
  const envelope = preparationEnvelope(source.admissionId, preparationProfile(digest), settings,
    new Date('2026-09-21T00:00:00.000Z'), 1003, { kind: 'extract', input: input as BusterInputReference });
  const record: SourceReservation = {
    ...initialSourceReservation(source.admissionId, envelope, 1003, { bytes: 1000, entries: 7 }),
    parentInputId: preparationDigest(input), extractionGeneration: 1, phase: 'prepared',
    gate: { ...effects.gate, preparationUid: 1003 },
    source: { ...source, schemaVersion: 'buster-prepared-source.v1', preparationUid: 1003,
      attemptSpecDigest: envelope.attemptSpecDigest },
  };
  const state = { schemaVersion: 'buster-preparation-ledger.v1' as const, reservations: [record] };
  assert.doesNotThrow(() => validateSourceLedger(state));
  for (const [field, foreign] of [['jobId', `job:${'e'.repeat(64)}`],
    ['requestDigest', `sha256:${'e'.repeat(64)}`], ['headerDigest', `sha256:${'e'.repeat(64)}`]]) {
    assert.throws(() => validateSourceLedger({ ...state,
      reservations: [{ ...record, source: { ...record.source!, [field!]: foreign } }] }), /LEDGER_INVALID/);
  }
});

// Scalar metadata controls only: mocked fixed UID is not native execution evidence.
test('both metadata producers enforce explicitly versioned authored result reserve and preserve legacy capacity', t => {
  const identityProcess = process as typeof process & { getuid(): number; getgid(): number };
  t.mock.method(identityProcess, 'getuid', () => 1003);
  t.mock.method(identityProcess, 'getgid', () => 1003);
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  const authored = retained.profiles['local-A'].settings.preparation;
  const legacy = (captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
  const wire = Buffer.from(JSON.stringify(fullJob));
  const headerBytes = Buffer.byteLength(JSON.stringify(job));
  const producers = [
    (settings: any, version: any) => stagedInputMetadata(fullJob, wire, source.admissionId, digest, settings, version),
    (settings: any, version: any) => preparedSourceMetadata(fullJob, source.admissionId, digest, settings, version),
  ];
  for (const produce of producers) {
    const settings = { ...authored, maximumHeaderBytes: headerBytes, maximumInputBytes: 1024, resultInputReserveMultiplier: 8 };
    const original = produce(settings, 'v10');
    const boundary = Buffer.byteLength(JSON.stringify(original)) + 8 * settings.maximumInputBytes;
    const exact = { ...settings, maximumResultBytes: boundary };
    assert.deepEqual(produce(exact, 'v10'), original, 'exact authored capacity is admitted');
    assert.throws(() => produce({ ...exact, maximumResultBytes: boundary - 1 }, 'v10'), /RESULT_CAPACITY/, 'one byte below actual metadata plus authored reserve rejects');
    assert.deepEqual(produce({ ...legacy, maximumHeaderBytes: headerBytes, maximumInputBytes: 1024, maximumResultBytes: boundary - 1 }, 'legacy'), original, 'legacy keeps the original four-input reserve');
    assert.throws(() => produce(exact, 'legacy'), /PREPARATION_INVALID/, 'v10 author cannot silently enter legacy codec');
    assert.throws(() => produce(exact, 'unknown'), /VERSION_INVALID/);
    const missing = { ...exact }; delete missing.resultInputReserveMultiplier;
    assert.throws(() => produce(missing, 'v10'), /V10_INVALID/);
  }
});

// Real child-process diagnostic receiving, not archive/native installation proof.
test('archive diagnostics receive explicit complete v10 author in listing and extraction while legacy stays unchanged', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-tar-diagnostics-'));
  try {
    const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
    const author = retained.profiles['local-A'].settings.preparation;
    const diagnostic = 'prefix-' + '😀é'.repeat(30) + '-tail';
    for (const phase of ['listing', 'extraction']) {
      const executable = path.join(root, phase);
      const marker = path.join(root, phase + '.calls');
      await fs.writeFile(executable, '#!/usr/bin/env node\n' +
        `const fs = require('node:fs'); fs.appendFileSync(${JSON.stringify(marker)}, 'call\\n');
` +
        `if (${JSON.stringify(phase)} === 'extraction' && process.argv.includes('-tvzf')) { process.stdout.write('-rw-r--r-- 0/0 1 2026-10-20 00:00 safe\\n'); }
` +
        `else { process.stderr.write(${JSON.stringify(diagnostic)}); process.exitCode = 7; }
`, { mode: 0o700 });
      for (const units of [7, 13]) {
        await assert.rejects(safeExtract(executable, '/unused', root,
          { ...author, maximumTarStderrBytes: 32, tarDiagnosticCodeUnits: units }, new AbortController().signal, 'v10'),
          error => error instanceof Error && error.message ===
            'BUSTER_REMOTE_TAR_FAILED:7::' + Buffer.from(diagnostic).subarray(0, 32).toString('utf8').slice(-units));
      }
      const legacy = (captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
      await assert.rejects(safeExtract(executable, '/unused', root, { ...legacy, maximumTarStderrBytes: 32 }, new AbortController().signal),
        error => error instanceof Error && error.message === 'BUSTER_REMOTE_TAR_FAILED:7::' + Buffer.from(diagnostic).subarray(0, 32).toString('utf8'));
      const calls = await fs.readFile(marker, 'utf8');
      const missing = { ...author }; delete missing.tarDiagnosticCodeUnits;
      for (const malformed of [missing, { ...author, tarDiagnosticCodeUnits: 0 }, { ...author, tarDiagnosticCodeUnits: 4097 }, { ...author, tarDiagnosticCodeUnits: '7' }]) {
        await assert.rejects(safeExtract(executable, '/unused', root, malformed, new AbortController().signal, 'v10'), /V10_INVALID/);
      }
      await assert.rejects(safeExtract(executable, '/unused', root, author, new AbortController().signal), /VERSION_INVALID/);
      assert.equal(await fs.readFile(marker, 'utf8'), calls, 'invalid or mixed author must not spawn a child');
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


// These are real envelope/ledger codecs with a modeled sealed result identity;
// this does not certify a native cleanup, receipt, filesystem owner or release.
test('v10 cleanup captures original A settings and durable identity despite current B', async () => {
  const { interruptedNativeWorkerResult } = await import('../../../skills/worker/core/worker/native-result.ts');
  const { preparationCleanupPolicy } = await import('../../../skills/buster/engine/test-gates/preparation-cleanup-policy.ts');
  const { preparationCleanupEnvelope } = await import('../../../skills/buster/engine/test-gates/preparation-cleanup-envelope.ts');
  const { validatePreparationCleanupChain } = await import('../../../skills/buster/engine/test-gates/preparation-cleanup-validation.ts');
  const { workerAttemptSpecDigest, workerProfileDigest } = await import('@kubeclaw/worker-core');
  const { PreparationSourceLedger } = await import('../../../skills/buster/engine/test-gates/preparation-ledger.ts');
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-cleanup-codec-'));
  try {
    for (const profileName of ['local-A', 'local-B']) {
      const author = retained.profiles[profileName].settings.preparation;
      const current = { ...author, attemptLogBytes: author.attemptLogBytes + 1 };
      const root = path.join(rootDirectory, profileName);
      const ledger = new PreparationSourceLedger(root, author, undefined, 'v10');
      const original = await ledger.reserve(source.admissionId, preparationProfile(digest, 'v10'), new Date('2026-09-21T00:00:00.000Z'));
      const gate = { preparationUid: 1003 as const, device: 1, inode: 2, markerDigest: digest };
      await ledger.bindGate(source.admissionId, gate);
      const effect = { ...effects, schemaVersion: 'buster-preparation-cleanup-effects.v1' as const,
        originalEnvelopeDigest: preparationDigest(original), gate };
      const result = interruptedNativeWorkerResult(original, new Date(original.issuedAt), 'TEST_MODELED_NOT_LAUNCHED', null, true);
      const cleanup = preparationCleanupEnvelope(original, result, effect, current, digest);
      assert.equal(cleanup.limits.logBytes, author.attemptLogBytes, 'cleanup takes original A, never current B');
      assert.equal(cleanup.limits.evidenceBytes, author.attemptEvidenceBytes);
      assert.equal(cleanup.limits.evidenceFiles, author.attemptEvidenceFiles);
      assert.equal(Date.parse(cleanup.queueDeadline) - Date.parse(cleanup.issuedAt),
        author.timeoutMs + author.completionPhaseAllowance * author.cleanupTimeoutMs);
      assert.equal(cleanup.profile.profileId, 'buster-native-source-cleanup-v2');
      const policy = preparationCleanupPolicy(cleanup, author);
      assert.deepEqual(policy.settings, author);
      assert.equal(policy.limits.timeoutMs, author.timeoutMs + author.completionPhaseAllowance * author.cleanupTimeoutMs);
      assert.equal(policy.limits.cpuTimeMs, author.resourcePolicy.cpuTimeMs);
      assert.equal(policy.limits.memoryBytes, author.resourcePolicy.memoryBytes);
      assert.equal(policy.limits.tasks, author.resourcePolicy.tasks);
      assert.equal(policy.limits.maximumInputBytes, author.maximumInputBytes);
      assert.equal(policy.limits.maximumOutputBytes, author.maximumOutputBytes);
      assert.equal(policy.limits.pollIntervalMs, author.pollIntervalMs);
      assert.equal(policy.limits.closeTimeoutMs, author.closeTimeoutMs);
      assert.throws(() => preparationCleanupPolicy(cleanup, current), /POLICY_MISMATCH/);
      for (const change of [
        (e: typeof cleanup) => { e.limits.logBytes++; },
        (e: typeof cleanup) => { e.limits.evidenceBytes++; },
        (e: typeof cleanup) => { e.limits.evidenceFiles++; },
        (e: typeof cleanup) => { e.limits.resultBytes++; },
        (e: typeof cleanup) => { e.limits.timeoutMs++; },
        (e: typeof cleanup) => { e.limits.cleanupTimeoutMs++; },
        (e: typeof cleanup) => { e.resourceBudgets.cpuTimeMs = { state: 'requested', limit: author.resourcePolicy.cpuTimeMs + 1 }; },
        (e: typeof cleanup) => { e.resourceBudgets.maximumMemoryBytes = { state: 'requested', limit: author.resourcePolicy.memoryBytes + 1 }; },
        (e: typeof cleanup) => { e.resourceBudgets.maximumTasks = { state: 'requested', limit: author.resourcePolicy.tasks + 1 }; },
        (e: typeof cleanup) => { e.profile.engine.engineVersion = '1.0.0'; },
        (e: typeof cleanup) => { e.profile.profileId = 'unknown-cleanup-profile'; },
        (e: typeof cleanup) => { e.queueDeadline = new Date(Date.parse(e.queueDeadline) + 1).toISOString(); },
        (e: typeof cleanup) => { e.claim.expiresAt = new Date(Date.parse(e.claim.expiresAt) + 1).toISOString(); },
      ]) {
        const altered = structuredClone(cleanup); change(altered);
        altered.profile.profileDigest = workerProfileDigest(altered.profile);
        altered.attemptSpecDigest = workerAttemptSpecDigest(altered);
        assert.throws(() => preparationCleanupPolicy(altered, author), /CLEANUP_/);
      }
      // A supported nondefault allowance detects a remaining literal eight in the real launch policy.
      const alternate = { ...author, completionPhaseAllowance: author.completionPhaseAllowance + 1 };
      const alternateOriginal = preparationEnvelope(source.admissionId, preparationProfile(digest, 'v10'), alternate,
        new Date(original.issuedAt), 1003, { kind: 'stage' }, 'v10');
      const alternateEffect = { ...effect, originalEnvelopeDigest: preparationDigest(alternateOriginal) };
      const alternateResult = interruptedNativeWorkerResult(alternateOriginal, new Date(original.issuedAt), 'TEST_MODELED_NOT_LAUNCHED', null, true);
      const alternateCleanup = preparationCleanupEnvelope(alternateOriginal, alternateResult, alternateEffect, current, digest);
      assert.equal(preparationCleanupPolicy(alternateCleanup, alternate).limits.timeoutMs,
        alternate.timeoutMs + alternate.completionPhaseAllowance * alternate.cleanupTimeoutMs);
      const missing = structuredClone(author); delete missing.completionPhaseAllowance;
      assert.throws(() => preparationCleanupPolicy(cleanup, missing), /V10_INVALID/);
      // Exercise the actual host receiver, stopping at its REAL fixed-UID denial.
      // No UID spoofing, cleanup action, executor receipt or native acceptance is claimed.
      const hostEffect = { ...effect, gate: { ...gate,
        preparationUid: (process.getuid?.() === 1003 ? 1004 : 1003) as 1003 | 1004 } };
      const hostEnvelope = preparationCleanupEnvelope(original, result, hostEffect, author, digest);
      const hostFile = new URL('../../../skills/buster/engine/test-gates/preparation-cleanup-host.ts', import.meta.url);
      const { fileURLToPath } = await import('node:url');
      for (const [hostSettings, diagnostic] of [
        [author, /BUSTER_PREPARATION_SLOT_INVALID/],
        [current, /BUSTER_PREPARATION_CLEANUP_POLICY_MISMATCH/],
        [missing, /BUSTER_PREPARATION_V10_INVALID/],
      ] as const) {
        const host = spawnSync(process.execPath, [fileURLToPath(hostFile)], {
          input: JSON.stringify(hostEnvelope), encoding: 'utf8', timeout: 15000,
          env: { ...process.env, BUSTER_PREPARATION_ASSIGNED_INPUT_BYTES: String(author.maximumInputBytes),
            BUSTER_PREPARATION_ASSIGNED_CLEANUP: JSON.stringify({ effects: hostEffect, settings: hostSettings }) },
        });
        assert.ifError(host.error);
        assert.equal(host.status, 1);
        assert.equal(host.stdout, '');
        assert.match(host.stderr, diagnostic);
      }


      const association = { envelope: cleanup, settings: structuredClone(author), effects: effect,
        previousEnvelopeDigest: null, previousResultDigest: null, resultDigest: null };
      assert.doesNotThrow(() => validatePreparationCleanupChain([association], original, gate));
      await ledger.reserveCleanup(source.admissionId, association);
      const reopened = new PreparationSourceLedger(root, current, undefined, 'v10');
      assert.deepEqual((await reopened.reservations())[0]!.cleanup, [association]);
      const file = path.join(root, 'source-ledger', 'state.json');
      const valid = await fs.readFile(file);
      for (const mutate of [
        (a: typeof association) => { a.settings = current; },
        (a: typeof association) => { delete (a.settings as Record<string, unknown>).attemptLogBytes; },
        (a: typeof association) => { a.envelope.limits.logBytes++; },
        (a: typeof association) => { a.envelope.resourceBudgets.maximumTasks = { state: 'requested', limit: author.resourcePolicy.tasks + 1 }; },
        (a: typeof association) => { a.envelope.profile.profileId = 'buster-native-source-cleanup-v1'; },
      ]) {
        const changed = structuredClone(association); mutate(changed);
        changed.envelope.profile.profileDigest = workerProfileDigest(changed.envelope.profile);
        changed.envelope.attemptSpecDigest = workerAttemptSpecDigest(changed.envelope);
        assert.throws(() => validatePreparationCleanupChain([changed], original, gate));
        const disk = JSON.parse(valid.toString()); disk.reservations[0].cleanup = [changed];
        await fs.writeFile(file, JSON.stringify(disk)); const malformed = await fs.readFile(file);
        await assert.rejects(reopened.reservations());
        assert.deepEqual(await fs.readFile(file), malformed, 'rejected recovery never rewrites disk');
      }
      await fs.writeFile(file, valid);
      assert.deepEqual((await reopened.reservations())[0]!.cleanup, [association]);
      const legacy = (captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
      const old = preparationEnvelope(source.admissionId, preparationProfile(digest), legacy, new Date(), 1003, { kind: 'stage' });
      const oldEffect = { ...effect, originalEnvelopeDigest: preparationDigest(old) };
      const oldCleanup = preparationCleanupEnvelope(old, interruptedNativeWorkerResult(old, new Date(old.issuedAt), 'TEST_MODELED_NOT_LAUNCHED', null, true), oldEffect, legacy, digest);
      assert.equal(oldCleanup.profile.profileId, 'buster-native-source-cleanup-v1');
      assert.equal(oldCleanup.limits.logBytes, 1);
      assert.equal(preparationCleanupPolicy(oldCleanup, legacy).limits.timeoutMs, legacy.timeoutMs + 8 * legacy.cleanupTimeoutMs);
      assert.throws(() => preparationCleanupPolicy(oldCleanup, author), /PREPARATION_INVALID/);
      assert.throws(() => preparationCleanupPolicy(cleanup, legacy), /V10_INVALID/);
      assert.doesNotThrow(() => validatePreparationCleanupChain([{ ...association, envelope: oldCleanup, settings: legacy, effects: oldEffect }], old, gate));
    }
  } finally { await fs.rm(rootDirectory, { recursive: true, force: true }); }
});


// Real versioned ledger/capability lookup only; no native ownership, release or
// receipt is fabricated. Wrong codecs must reject BEFORE any source/owner work.
test('cleanup recovery uses explicit ledger codec and fences mixed original generations', async () => {
  const { PreparationSourceLedger } = await import('../../../skills/buster/engine/test-gates/preparation-ledger.ts');
  const { preparationCleanupReconciliation } = await import('../../../skills/buster/engine/test-gates/preparation-cleanup.ts');
  const { preparationCleanupProfile, preparationCleanupEnvelope } = await import('../../../skills/buster/engine/test-gates/preparation-cleanup-envelope.ts');
  const { interruptedNativeWorkerResult } = await import('../../../skills/worker/core/worker/native-result.ts');
  type Options = import('../../../skills/buster/engine/test-gates/preparation-execution.ts').PreparationExecutionOptions;
  type Reconciliation = ReturnType<typeof preparationCleanupReconciliation>;
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  const legacy = (captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-cleanup-version-'));
  try {
    for (const name of ['local-A', 'local-B']) {
      const author = retained.profiles[name].settings.preparation;
      const originals = (['legacy', 'v10'] as const).map(version => preparationEnvelope(source.admissionId,
        preparationProfile(digest, version), version === 'legacy' ? legacy : author,
        new Date('2026-09-21T00:00:00.000Z'), 1003, { kind: 'stage' }, version));
      const results = originals.map(envelope => interruptedNativeWorkerResult(envelope, new Date(envelope.issuedAt), 'TEST_MODELED_NOT_LAUNCHED', null, true));
      const cleanups = originals.map((envelope, index) => preparationCleanupEnvelope(envelope, results[index]!,
        { ...effects, schemaVersion: 'buster-preparation-cleanup-effects.v1', originalEnvelopeDigest: preparationDigest(envelope),
          gate: { ...effects.gate, preparationUid: 1003 } }, index === 0 ? legacy : author, digest));
      for (const [index, version] of (['legacy', 'v10'] as const).entries()) {
        const ledger = new PreparationSourceLedger(path.join(root, name, version), index === 0 ? legacy : author, undefined, version);
        assert.equal(ledger.version, version);
        // Access sentinel: empty ledger lookup may not use native authority. It
        // is not a substitute owner and cannot produce a native success.
        const values = { ledger, engineContentDigest: digest, journal: undefined };
        const options = new Proxy(values as unknown as Options, { get(target, property, receiver) {
          if (!(property in values)) throw new Error(`UNEXPECTED_NATIVE_EFFECT:${String(property)}`);
          return Reflect.get(target, property, receiver);
        } });
        const capability = preparationCleanupReconciliation(options);
        assert.equal(capability.cleanupProfileDigest, preparationCleanupProfile(digest, version).profileDigest);
        assert.equal(await capability.reconcile({ envelope: originals[index]!, result: results[index]!,
          ownership: undefined as unknown as Parameters<Reconciliation['reconcile']>[0]['ownership'] }), null);
        assert.equal(await capability.resolveFailedCleanup!({ envelope: cleanups[index]!, result: results[index]! }), null);
        const foreign = 1 - index;
        await assert.rejects(async () => capability.reconcile({ envelope: originals[foreign]!, result: results[foreign]!,
          ownership: undefined as unknown as Parameters<Reconciliation['reconcile']>[0]['ownership'] }), /CLEANUP_VERSION_MISMATCH/);
        await assert.rejects(capability.resolveFailedCleanup!({ envelope: cleanups[foreign]!, result: results[foreign]! }), /CLEANUP_VERSION_MISMATCH/);
        assert.deepEqual(await ledger.reservations(), []);
        await assert.rejects(fs.stat(path.join(root, name, version, 'source-ledger', 'state.json')), { code: 'ENOENT' });
      }
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

// Real phase/host boundary checks, not native execution or source ownership proof.
test('source phase uses original explicit A/B codec through launch policy and real host admission', async () => {
  const { preparationPhasePolicy } = await import('../../../skills/buster/engine/test-gates/preparation-native-phase.ts');
  const { materializePreparedSource } = await import('../../../skills/buster/engine/test-gates/preparation-source.ts');
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  const legacy = (captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine']!.settings as unknown as BusterSettings).preparation;
  const slot = process.getuid?.() === 1003 ? 1004 : 1003;
  for (const author of [legacy, ...['local-A', 'local-B'].map(name => retained.profiles[name].settings.preparation)]) {
    const version = author === legacy ? 'legacy' : 'v10';
    const settings = version === 'legacy' ? author : { ...author, completionPhaseAllowance: author.completionPhaseAllowance + 1 };
    const envelope = preparationEnvelope(source.admissionId, preparationProfile(digest, version), settings,
      new Date('2026-09-21T00:00:00.000Z'), slot, { kind: 'stage' }, version);
    const policy = preparationPhasePolicy(envelope);
    assert.deepEqual(policy.settings, settings);
    assert.equal(policy.limits.timeoutMs, settings.timeoutMs + (version === 'legacy' ? 8 : settings.completionPhaseAllowance) * settings.cleanupTimeoutMs);
    assert.equal(policy.limits.cpuTimeMs, settings.resourcePolicy.cpuTimeMs);
    assert.equal(policy.limits.memoryBytes, settings.resourcePolicy.memoryBytes);
    assert.equal(policy.limits.maximumInputBytes, settings.maximumInputBytes);
    // Actually execute the installed host decoder, stopping at its real UID denial.
    const host = spawnSync(process.execPath, [new URL('../../../skills/buster/engine/test-gates/preparation-host.ts', import.meta.url).pathname], {
      input: JSON.stringify(envelope), encoding: 'utf8', env: { ...process.env,
        KUBECLAW_NATIVE_SCOPE: '/not-used-before-slot-denial',
        BUSTER_PREPARATION_ASSIGNED_INPUT_BYTES: String(settings.maximumInputBytes) },
    });
    assert.notEqual(host.status, 0);
    assert.match(host.stderr, /BUSTER_PREPARATION_SLOT_INVALID/);
    assert.doesNotMatch(host.stderr, /V10_INVALID|SETTINGS_INVALID|OPERATION_INVALID/);
    const limited = { ...settings, maximumHeaderBytes: Buffer.byteLength(JSON.stringify(job)) - 1 };
    await assert.rejects(materializePreparedSource(fullJob, { admissionId: source.admissionId, attemptSpecDigest: digest,
      root: '/not-used-before-header-denial', tarExecutable: '/not-used', settings: limited, version,
      signal: new AbortController().signal, onAllocated() { assert.fail('must not allocate'); } }), /BUSTER_PREPARATION_HEADER_LIMIT/);
    if (version === 'v10') {
      for (const mutate of [
        (e: typeof envelope) => { e.operation.inputSchemaId = 'buster-preparation-input.v1'; },
        (e: typeof envelope) => { e.operation.contractId = 'unknown'; },
        (e: typeof envelope) => { delete (e.operation.values.settings as Record<string, unknown>).completionPhaseAllowance; },
        (e: typeof envelope) => { e.operation.values.phase = { kind: 'historical' }; },
      ]) {
        const changed = structuredClone(envelope); mutate(changed);
        assert.throws(() => preparationPhasePolicy(changed), /VERSION_MISMATCH|OPERATION_INVALID|V10_INVALID|HISTORICAL_UNSUPPORTED/);
      }
    }
  }
});


// Rehashed envelope mutations are structurally valid but must not select a
// different native policy than the complete original v10 operation author.
// This is codec/host admission coverage, not native execution proof.
test('v10 source operation rejects competing profile limits budgets and deadlines before launch', async () => {
  const { preparationPhasePolicy } = await import('../../../skills/buster/engine/test-gates/preparation-native-phase.ts');
  const { workerAttemptSpecDigest, workerProfileDigest } = await import('@kubeclaw/worker-core');
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  for (const name of ['local-A', 'local-B']) {
    const settings = retained.profiles[name].settings.preparation;
    for (const phase of [{ kind: 'stage' as const }, { kind: 'extract' as const, input: input as BusterInputReference }]) {
      const original = preparationEnvelope(source.admissionId, preparationProfile(digest, 'v10'), settings,
        new Date('2026-09-21T00:00:00.000Z'), 1003, phase, 'v10');
      const before = JSON.stringify(original);
      assert.deepEqual(preparationPhasePolicy(original).settings, settings);
      for (const mutate of [
        (e: typeof original) => { e.profile.profileId = 'foreign-source-profile'; },
        (e: typeof original) => { e.profile.engine.engineVersion = '1.0.0'; },
        (e: typeof original) => { e.limits.logBytes++; },
        (e: typeof original) => { e.limits.evidenceBytes++; },
        (e: typeof original) => { e.limits.evidenceFiles++; },
        (e: typeof original) => { e.limits.resultBytes++; },
        (e: typeof original) => { e.limits.timeoutMs++; },
        (e: typeof original) => { e.limits.cleanupTimeoutMs++; },
        (e: typeof original) => { e.resourceBudgets.cpuTimeMs = { state: 'requested', limit: settings.resourcePolicy.cpuTimeMs + 1 }; },
        (e: typeof original) => { e.resourceBudgets.maximumMemoryBytes = { state: 'requested', limit: settings.resourcePolicy.memoryBytes + 1 }; },
        (e: typeof original) => { e.resourceBudgets.maximumTasks = { state: 'requested', limit: settings.resourcePolicy.tasks + 1 }; },
        (e: typeof original) => { e.queueDeadline = new Date(Date.parse(e.queueDeadline) + 1).toISOString(); },
        (e: typeof original) => { e.claim.expiresAt = new Date(Date.parse(e.claim.expiresAt) + 1).toISOString(); },
        (e: typeof original) => { (e.operation.values.settings as typeof settings).attemptLogBytes++; },
      ]) {
        const altered = structuredClone(original); mutate(altered);
        altered.profile.profileDigest = workerProfileDigest(altered.profile);
        altered.attemptSpecDigest = workerAttemptSpecDigest(altered);
        assert.throws(() => preparationPhasePolicy(altered), /BUSTER_PREPARATION_OPERATION_POLICY_MISMATCH/);
      }
      assert.equal(JSON.stringify(original), before, 'denial never mutates original A');
      assert.deepEqual(preparationPhasePolicy(original).settings, settings, 'original A remains valid after competing-policy denials');
    }
  }
});

// Both privileged native launch and retained ledger call this original decoder.
// Reject malformed source phases there, not only inside the spawned host.
test('v10 source phase codec rejects malformed operations before native launch', async () => {
  const { preparationPhasePolicy } = await import('../../../skills/buster/engine/test-gates/preparation-native-phase.ts');
  const { workerAttemptSpecDigest } = await import('@kubeclaw/worker-core');
  const retained = JSON.parse(readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/stand/config/components/buster-engine.config.json', import.meta.url), 'utf8'));
  for (const name of ['local-A', 'local-B']) {
    const settings = retained.profiles[name].settings.preparation;
    for (const phase of [{ kind: 'stage' as const }, { kind: 'extract' as const, input: input as BusterInputReference }]) {
      const original = preparationEnvelope(source.admissionId, preparationProfile(digest, 'v10'), settings,
        new Date('2026-09-21T00:00:00.000Z'), 1003, phase, 'v10');
      const before = JSON.stringify(original);
      for (const invalid of [null, [], {}, { kind: 'unknown' }, { kind: 'stage', input },
        { kind: 'extract' }, { kind: 'extract', input, extra: true }]) {
        const altered = structuredClone(original);
        altered.operation.values.phase = invalid;
        altered.attemptSpecDigest = workerAttemptSpecDigest(altered);
        assert.throws(() => preparationPhasePolicy(altered), /BUSTER_PREPARATION_PHASE_INVALID/);
      }
      assert.equal(JSON.stringify(original), before);
      assert.deepEqual(preparationPhasePolicy(original).settings, settings);
    }
  }
});
