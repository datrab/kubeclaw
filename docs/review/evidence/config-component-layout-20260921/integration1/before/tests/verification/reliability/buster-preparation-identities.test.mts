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

import { busterPreparationSettingsFromConfig } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
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
const job = preparedPlanHeader(createRemotePlanJob({ idempotencyKey: 'identity-test', pipelineStageId: 'stage:test',
  plan: plan('blocking', null), sourceSnapshot: snapshot, repositoryArchive: archive,
  grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-09-21T00:00:00.000Z' }));
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
  const settings = busterPreparationSettingsFromConfig(JSON.parse(readFileSync(
    new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url), 'utf8')));
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
