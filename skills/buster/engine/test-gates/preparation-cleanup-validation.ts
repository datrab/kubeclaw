import { canonicalJson, validateWorkerResourceContractV3,
  type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { captureBusterPreparationV10 } from '@kubeclaw/plugin-foundation/config/buster-preparation-v10';
import { preparationOperationSettings } from './preparation-envelope.ts';
import { preparationCleanupPolicy } from './preparation-cleanup-policy.ts';
import { preparationDigest } from './preparation-header.ts';
import { assertPreparationCleanupEffects, type PreparationCleanupAssociation } from './preparation-cleanup-binding.ts';
import type { PreparationGateBinding } from './preparation-gate.ts';

function invalid(): never { throw new Error('BUSTER_PREPARATION_CLEANUP_ASSOCIATION_INVALID'); }
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);

function validateAssociation(value: PreparationCleanupAssociation, original: WorkerAttemptEnvelopeV3): void {
  if (!value || Object.keys(value).sort().join(',')
    !== 'effects,envelope,previousEnvelopeDigest,previousResultDigest,resultDigest,settings') invalid();
  assertPreparationCleanupEffects(value.effects);
  validateWorkerResourceContractV3('workerAttemptEnvelope', value.envelope);
  const v10 = original.operation.contractId === 'kubeclaw.buster-preparation@2';
  if (v10) preparationOperationSettings(original);
  const captured = v10 ? captureBusterPreparationV10(original.operation.values.settings) : null;
  const settings = captured ?? validateBusterPreparationSettings(value.settings);
  if (captured) {
    // The original source operation, never current process options or extra keys,
    // chooses the codec and the complete immutable cleanup execution policy.
    preparationCleanupPolicy(value.envelope, value.settings);
    if (canonicalJson(value.settings) !== canonicalJson(captured)) invalid();
  }
  if ([value.envelope, value.settings].some(item => Buffer.byteLength(canonicalJson(item)) > settings.maximumInputBytes)) invalid();
  for (const item of [value.previousEnvelopeDigest, value.previousResultDigest, value.resultDigest]) {
    if (item !== null && !digest(item)) invalid();
  }
  const operation = value.envelope.operation;
  if (operation.contractId !== 'kubeclaw.native-source-cleanup@1'
    || operation.inputSchemaId !== 'native-source-cleanup-input.v1'
    || Object.keys(operation.values).sort().join(',') !== 'effectsDigest,reconciles'
    || operation.values.effectsDigest !== preparationDigest(value.effects)) invalid();
}

function validateOriginal(association: PreparationCleanupAssociation, original: WorkerAttemptEnvelopeV3): void {
  const reference = association.envelope.operation.values.reconciles as Record<string, unknown>;
  if (!reference || Object.keys(reference).sort().join(',') !== [
    'attemptId', 'attemptSpecDigest', 'claimGeneration', 'claimId', 'envelopeDigest',
    'profileDigest', 'receipt', 'resultDigest', 'workerId',
  ].sort().join(',')) invalid();
  const expected = { envelopeDigest: preparationDigest(original), attemptId: original.attemptId,
    attemptSpecDigest: original.attemptSpecDigest, profileDigest: original.profile.profileDigest,
    claimId: original.claim.claimId, claimGeneration: original.claim.generation, workerId: original.claim.workerId };
  if (Object.entries(expected).some(([key, value]) => reference[key] !== value) || !digest(reference.resultDigest)) invalid();
  const receipt = reference.receipt as Record<string, unknown>;
  if (!receipt || Object.keys(receipt).sort().join(',') !== 'receiptDigest,receiptId'
    || typeof receipt.receiptId !== 'string' || !digest(receipt.receiptDigest)) invalid();
  if (association.envelope.attemptId === original.attemptId
    || association.envelope.claim.claimId === original.claim.claimId) invalid();
}

/** This validates durable identity only; release additionally requires actual journal/owner verification. */
export function validatePreparationCleanupChain(value: readonly PreparationCleanupAssociation[],
  original: WorkerAttemptEnvelopeV3, gate: PreparationGateBinding | null): void {
  if (!Array.isArray(value)) invalid();
  let previous: PreparationCleanupAssociation | null = null;
  const attempts = new Set<string>();
  for (const association of value) {
    validateAssociation(association, original);
    validateOriginal(association, original);
    if (association.effects.originalEnvelopeDigest !== preparationDigest(original)
      || association.effects.admissionId !== original.operation.values.admissionId
      || preparationDigest(association.effects.gate) !== preparationDigest(gate)) invalid();
    if (association.previousEnvelopeDigest !== (previous ? preparationDigest(previous.envelope) : null)
      || association.previousResultDigest !== (previous?.resultDigest ?? null)) invalid();
    if (previous && (previous.resultDigest === null
      || preparationDigest(previous.effects) !== preparationDigest(association.effects))) invalid();
    if (attempts.has(association.envelope.attemptId)) invalid();
    attempts.add(association.envelope.attemptId);
    previous = association;
  }
}
