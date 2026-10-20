import { randomBytes } from 'node:crypto';
import { nativeSourceCleanupOperation, workerAttemptSpecDigest, workerProfileDigest } from '@kubeclaw/worker-core';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3,
  type WorkerAttemptResultV3, type WorkerProfileV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { preparationEnvelope, preparationOperationSettings, preparationProfile } from './preparation-envelope.ts';
import { preparationDigest } from './preparation-header.ts';
import { assertPreparationCleanupEffects, type PreparationCleanupEffects } from './preparation-cleanup-binding.ts';

export function preparationCleanupProfile(engineContentDigest: string, version: 'legacy' | 'v10' = 'legacy'): WorkerProfileV3 {
  const base = preparationProfile(engineContentDigest, version);
  const profile = { ...base, profileId: version === 'v10' ? 'buster-native-source-cleanup-v2' : 'buster-native-source-cleanup-v1',
    engine: { ...base.engine, engineId: 'buster-native-source-cleanup', contractId: 'kubeclaw.native-source-cleanup@1' } };
  return { ...profile, profileDigest: workerProfileDigest(profile) };
}

/** A fresh attempt has fresh claim identity, while the original effect and receipt stay exact. */
export function preparationCleanupEnvelope(original: WorkerAttemptEnvelopeV3, result: WorkerAttemptResultV3,
  effects: PreparationCleanupEffects, settings: BusterPreparationSettings, engineContentDigest: string): WorkerAttemptEnvelopeV3 {
  assertPreparationCleanupEffects(effects);
  const originalSettings = preparationOperationSettings(original);
  const version = original.operation.contractId === 'kubeclaw.buster-preparation@2' ? 'v10' : 'legacy';
  const captured = version === 'v10' ? originalSettings : settings;
  const base = preparationEnvelope(randomBytes(16).toString('hex'), preparationProfile(engineContentDigest, version),
    captured, new Date(), effects.gate.preparationUid, { kind: 'stage' }, version);
  const cleanupProfile = preparationCleanupProfile(engineContentDigest, version);
  const unsigned = { ...base, profile: cleanupProfile, nodeId: 'cleanup-source',
    operation: nativeSourceCleanupOperation(original, result, preparationDigest(effects)) };
  const envelope = { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(unsigned) };
  validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
  return envelope;
}
