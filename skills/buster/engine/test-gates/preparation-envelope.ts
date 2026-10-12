import type { HistoricalImportDescriptor } from './preparation-historical-reference.ts';
import type { WorkerAttemptEnvelopeV3, WorkerProfileV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateWorkerResourceContractV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { sha256Digest, workerAttemptSpecDigest, workerProfileDigest } from '@kubeclaw/worker-core';
import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import type { BusterInputReference } from './preparation-input.ts';
import type { BusterPreparationSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';

export function preparationProfile(engineContentDigest: string): WorkerProfileV3 {
  if (!/^sha256:[a-f0-9]{64}$/u.test(engineContentDigest)) throw new Error('BUSTER_PREPARATION_ENGINE_IDENTITY_REQUIRED');
  const profile = {
    schemaVersion: 'worker-profile.v3' as const,
    profileId: 'buster-native-preparation-v1', workerType: 'buster',
    coreContractId: 'kubeclaw.pipeline-worker-core@1',
    engine: { engineId: 'buster-native-preparation', contractId: 'kubeclaw.buster-preparation@1',
      engineVersion: '1.0.0', contentDigest: engineContentDigest },
    resourceCapabilities: {
      schemaVersion: 'worker-resource-capabilities.v2' as const,
      cpuTimeMs: { scope: 'native-attempt-tree' as const, unit: 'milliseconds' as const, measurement: 'measured' as const },
      maximumMemoryBytes: { scope: 'native-attempt-tree' as const, unit: 'bytes' as const, measurement: 'measured' as const },
      maximumTasks: { scope: 'native-attempt-tree' as const, unit: 'linux-tasks' as const, measurement: 'measured' as const },
    },
    capabilities: [],
  };
  return { ...profile, profileDigest: workerProfileDigest(profile) };
}

export type PreparationPhase = { readonly kind: 'historical'; readonly descriptor: HistoricalImportDescriptor }
  | { readonly kind: 'stage' }
  | { readonly kind: 'extract'; readonly input: BusterInputReference };

/** Parent-generated upload identity is durable before any request bytes reach the host. */
export function preparationEnvelope(admissionId: string, profile: WorkerProfileV3,
  settings: BusterPreparationSettings, now: Date, preparationUid: PreparationSlot, phase: PreparationPhase): WorkerAttemptEnvelopeV3 {
  if (!/^[a-f0-9]{32}$/u.test(admissionId)) throw new Error('BUSTER_PREPARATION_ADMISSION_ID_INVALID');
  assertPreparationSlot(preparationUid);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + settings.timeoutMs + 8 * settings.cleanupTimeoutMs).toISOString();
  const attemptId = `prepare-${admissionId}`;
  const unsigned = {
    schemaVersion: 'worker-attempt-envelope.v3' as const, protocolVersion: 'worker-protocol.v1' as const,
    pipelineRunId: attemptId, moduleId: null, gateId: null, planId: attemptId,
    nodeId: 'prepare-source', executionId: attemptId, attemptId, attemptNumber: 1,
    claim: { schemaVersion: 'attempt-claim.v1' as const, claimId: `claim-${admissionId}`, attemptId,
      generation: 1, workerId: 'buster-preparation', claimedAt: issuedAt, expiresAt },
    profile, packages: [], grantedCapabilities: [],
    limits: { timeoutMs: settings.timeoutMs, cleanupTimeoutMs: settings.cleanupTimeoutMs,
      logBytes: 1, resultBytes: settings.maximumResultBytes,
      evidenceBytes: 1, evidenceFiles: 1 },
    resourceBudgets: {
      schemaVersion: 'worker-resource-budgets.v2' as const,
      cpuTimeMs: { state: 'requested' as const, limit: settings.resourcePolicy.cpuTimeMs },
      maximumMemoryBytes: { state: 'requested' as const, limit: settings.resourcePolicy.memoryBytes },
      maximumTasks: { state: 'requested' as const, limit: settings.resourcePolicy.tasks },
    },
    inputs: [],
    operation: { contractId: 'kubeclaw.buster-preparation@1', inputSchemaId: 'buster-preparation-input.v1',
      inputSchemaDigest: sha256Digest({ schemaVersion: 'buster-preparation-input.v1', fields: ['admissionId', 'settings', 'preparationUid', 'phase'] }),
      values: { admissionId, preparationUid, settings: JSON.parse(JSON.stringify(settings)),
        phase: JSON.parse(JSON.stringify(phase)) } },
    cancellationId: `cancel-${admissionId}`, issuedAt, queueDeadline: expiresAt,
  };
  const envelope = { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(unsigned) };
  validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
  return envelope;
}
