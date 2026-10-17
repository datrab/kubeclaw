import { randomBytes } from 'node:crypto';
import { nativeSourceCleanupOperation, workerAttemptSpecDigest, workerProfileDigest } from '@kubeclaw/worker-core';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3,
  type WorkerAttemptResultV3, type WorkerProfileV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { preparationEnvelope, preparationProfile } from './preparation-envelope.ts';
import { preparationDigest } from './preparation-header.ts';
import { assertPreparationCleanupEffects, type PreparationCleanupEffects } from './preparation-cleanup-binding.ts';

export function preparationCleanupProfile(engineContentDigest: string): WorkerProfileV3 {
  const base = preparationProfile(engineContentDigest);
  const profile = { ...base, profileId: 'buster-native-source-cleanup-v1',
    engine: { ...base.engine, engineId: 'buster-native-source-cleanup', contractId: 'kubeclaw.native-source-cleanup@1' } };
  return { ...profile, profileDigest: workerProfileDigest(profile) };
}

/** A fresh attempt has fresh claim identity, while the original effect and receipt stay exact. */
export function preparationCleanupEnvelope(original: WorkerAttemptEnvelopeV3, result: WorkerAttemptResultV3,
  effects: PreparationCleanupEffects, settings: BusterPreparationSettings, engineContentDigest: string): WorkerAttemptEnvelopeV3 {
  assertPreparationCleanupEffects(effects);
  const base = preparationEnvelope(randomBytes(16).toString('hex'), preparationCleanupProfile(engineContentDigest),
    settings, new Date(), effects.gate.preparationUid, { kind: 'stage' });
  const unsigned = { ...base, nodeId: 'cleanup-source',
    operation: nativeSourceCleanupOperation(original, result, preparationDigest(effects)) };
  const envelope = { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(unsigned) };
  validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
  return envelope;
}
