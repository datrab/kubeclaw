import type { BusterPreparationSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';
import type { WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import type { PreparationGateBinding } from './preparation-gate.ts';

export interface PreparationCleanupEffects {
  readonly schemaVersion: 'buster-preparation-cleanup-effects.v1';
  readonly admissionId: string;
  readonly originalEnvelopeDigest: string;
  readonly gate: PreparationGateBinding;
  readonly data: { readonly device: number; readonly inode: number; readonly uid: number } | null;
}

/** Every retry keeps its immutable predecessor identity; no receipt is replaced. */
export interface PreparationCleanupAssociation {
  readonly envelope: WorkerAttemptEnvelopeV3;
  readonly settings: BusterPreparationSettings;
  readonly effects: PreparationCleanupEffects;
  readonly previousEnvelopeDigest: string | null;
  readonly previousResultDigest: string | null;
  readonly resultDigest: string | null;
}

/** Journal admission independently enforces this complete serialized-envelope ceiling. */
export function preparationCleanupMetadataCapacity(maximumInputBytes: number): number {
  const digest = `sha256:${'f'.repeat(64)}`;
  const maximum = {
    envelope: null, settings: null,
    effects: { schemaVersion: 'buster-preparation-cleanup-effects.v1', admissionId: 'f'.repeat(32),
      originalEnvelopeDigest: digest,
      gate: { preparationUid: 1004, device: Number.MAX_SAFE_INTEGER, inode: Number.MAX_SAFE_INTEGER, markerDigest: digest },
      data: { device: Number.MAX_SAFE_INTEGER, inode: Number.MAX_SAFE_INTEGER, uid: 1004 } },
    previousEnvelopeDigest: digest, previousResultDigest: digest, resultDigest: digest,
  };
  // Both the complete envelope and its execution-settings snapshot are bounded by maximumInputBytes.
  const bytes = 2 * maximumInputBytes + Buffer.byteLength(canonicalJson(maximum)) - 8 + 1;
  if (!Number.isSafeInteger(bytes)) throw new Error('BUSTER_PREPARATION_CLEANUP_CAPACITY_INVALID');
  return bytes;
}

export function assertPreparationCleanupEffects(value: unknown): asserts value is PreparationCleanupEffects {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BUSTER_PREPARATION_CLEANUP_EFFECTS_INVALID');
  const effects = value as PreparationCleanupEffects;
  if (Object.keys(effects).sort().join(',') !== 'admissionId,data,gate,originalEnvelopeDigest,schemaVersion'
    || effects.schemaVersion !== 'buster-preparation-cleanup-effects.v1'
    || typeof effects.admissionId !== 'string' || !/^[a-f0-9]{32}$/u.test(effects.admissionId)
    || typeof effects.originalEnvelopeDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(effects.originalEnvelopeDigest)) {
    throw new Error('BUSTER_PREPARATION_CLEANUP_EFFECTS_INVALID');
  }
  assertGateEffect(effects.gate);
  assertDataEffect(effects.data, effects.gate.preparationUid);
} 

function assertGateEffect(gate: PreparationGateBinding): void {
  const integer = (item: unknown) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0;
  if (!gate || Object.keys(gate).sort().join(',') !== 'device,inode,markerDigest,preparationUid'
    || ![1003, 1004].includes(gate.preparationUid)
    || ![gate.device, gate.inode].every(integer)
    || typeof gate.markerDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(gate.markerDigest)) {
    throw new Error('BUSTER_PREPARATION_CLEANUP_EFFECTS_INVALID');
  }
}

function assertDataEffect(data: PreparationCleanupEffects['data'], uid: number): void {
  if (data === null) return;
  const integer = (item: unknown) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0;
  if (!data || Object.keys(data).sort().join(',') !== 'device,inode,uid'
    || ![data.device, data.inode].every(integer) || data.uid !== uid) {
    throw new Error('BUSTER_PREPARATION_CLEANUP_EFFECTS_INVALID');
  }
}
