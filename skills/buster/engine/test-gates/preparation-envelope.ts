import type { HistoricalImportDescriptor } from './preparation-historical-reference.ts';
import type { WorkerAttemptEnvelopeV3, WorkerProfileV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { canonicalJson, validateWorkerResourceContractV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { sha256Digest, workerAttemptSpecDigest, workerProfileDigest } from '@kubeclaw/worker-core';
import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import type { BusterInputReference } from './preparation-input.ts';
import { captureBusterPreparationV10 } from '@kubeclaw/plugin-foundation/config/buster-preparation-v10';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';

export function preparationProfile(engineContentDigest: string, version: 'legacy' | 'v10' = 'legacy'): WorkerProfileV3 {
  if (!['legacy', 'v10'].includes(version)) throw new Error('BUSTER_PREPARATION_VERSION_INVALID');
  const v10 = version === 'v10';
  if (!/^sha256:[a-f0-9]{64}$/u.test(engineContentDigest)) throw new Error('BUSTER_PREPARATION_ENGINE_IDENTITY_REQUIRED');
  const profile = {
    schemaVersion: 'worker-profile.v3' as const,
    profileId: v10 ? 'buster-native-preparation-v2' : 'buster-native-preparation-v1', workerType: 'buster',
    coreContractId: 'kubeclaw.pipeline-worker-core@1',
    engine: { engineId: 'buster-native-preparation', contractId: v10 ? 'kubeclaw.buster-preparation@2' : 'kubeclaw.buster-preparation@1',
      engineVersion: v10 ? '2.0.0' : '1.0.0', contentDigest: engineContentDigest },
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
  settings: BusterPreparationSettings, now: Date, preparationUid: PreparationSlot, phase: PreparationPhase, version: 'legacy' | 'v10' = 'legacy'): WorkerAttemptEnvelopeV3 {
  if (!['legacy', 'v10'].includes(version)) throw new Error('BUSTER_PREPARATION_VERSION_INVALID');
  const v10 = version === 'v10' ? captureBusterPreparationV10(settings) : null;
  if (!v10) validateBusterPreparationSettings(settings);
  // Historical imports retain their original codec and identity. This version
  // is only the new stage/extract wire, not authority to migrate old journals.
  if (v10 && phase.kind === 'historical') throw new Error('BUSTER_PREPARATION_V10_HISTORICAL_UNSUPPORTED');
  const contractId = v10 ? 'kubeclaw.buster-preparation@2' : 'kubeclaw.buster-preparation@1';
  if (v10 && profile.engine.contractId !== contractId) throw new Error('BUSTER_PREPARATION_PROFILE_VERSION_MISMATCH');
  const inputSchemaId = v10 ? 'buster-preparation-input.v2' : 'buster-preparation-input.v1';
  if (!/^[a-f0-9]{32}$/u.test(admissionId)) throw new Error('BUSTER_PREPARATION_ADMISSION_ID_INVALID');
  assertPreparationSlot(preparationUid);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + settings.timeoutMs + (v10 ? v10.completionPhaseAllowance : 8) * settings.cleanupTimeoutMs).toISOString();
  const attemptId = `prepare-${admissionId}`;
  const unsigned = {
    schemaVersion: 'worker-attempt-envelope.v3' as const, protocolVersion: 'worker-protocol.v1' as const,
    pipelineRunId: attemptId, moduleId: null, gateId: null, planId: attemptId,
    nodeId: 'prepare-source', executionId: attemptId, attemptId, attemptNumber: 1,
    claim: { schemaVersion: 'attempt-claim.v1' as const, claimId: `claim-${admissionId}`, attemptId,
      generation: 1, workerId: 'buster-preparation', claimedAt: issuedAt, expiresAt },
    profile, packages: [], grantedCapabilities: [],
    limits: { timeoutMs: settings.timeoutMs, cleanupTimeoutMs: settings.cleanupTimeoutMs,
      logBytes: v10 ? v10.attemptLogBytes : 1, resultBytes: settings.maximumResultBytes,
      evidenceBytes: v10 ? v10.attemptEvidenceBytes : 1, evidenceFiles: v10 ? v10.attemptEvidenceFiles : 1 },
    resourceBudgets: {
      schemaVersion: 'worker-resource-budgets.v2' as const,
      cpuTimeMs: { state: 'requested' as const, limit: settings.resourcePolicy.cpuTimeMs },
      maximumMemoryBytes: { state: 'requested' as const, limit: settings.resourcePolicy.memoryBytes },
      maximumTasks: { state: 'requested' as const, limit: settings.resourcePolicy.tasks },
    },
    inputs: [],
    operation: { contractId, inputSchemaId,
      inputSchemaDigest: sha256Digest({ schemaVersion: inputSchemaId, fields: ['admissionId', 'settings', 'preparationUid', 'phase'] }),
      values: { admissionId, preparationUid, settings: JSON.parse(JSON.stringify(settings)),
        phase: JSON.parse(JSON.stringify(phase)) } },
    cancellationId: `cancel-${admissionId}`, issuedAt, queueDeadline: expiresAt,
  };
  const envelope = { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(unsigned) };
  validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
  return envelope;
}

/** Decode only an explicitly versioned new source operation; never guess from keys. */
export function preparationOperationSettings(envelope: WorkerAttemptEnvelopeV3) {
  const operation = envelope.operation;
  const v10 = operation.contractId === 'kubeclaw.buster-preparation@2';
  if (!v10 && operation.contractId !== 'kubeclaw.buster-preparation@1') {
    throw new Error('BUSTER_PREPARATION_OPERATION_INVALID');
  }
  const schemaId = v10 ? 'buster-preparation-input.v2' : 'buster-preparation-input.v1';
  if (operation.inputSchemaId !== schemaId || operation.inputSchemaDigest !== sha256Digest({
    schemaVersion: schemaId, fields: ['admissionId', 'settings', 'preparationUid', 'phase'],
  }) || (v10 && envelope.profile.engine.contractId !== operation.contractId)) {
    throw new Error('BUSTER_PREPARATION_OPERATION_VERSION_MISMATCH');
  }
  if (v10 && (operation.values.phase as { kind?: unknown })?.kind === 'historical') {
    throw new Error('BUSTER_PREPARATION_V10_HISTORICAL_UNSUPPORTED');
  }
  if (!v10) return validateBusterPreparationSettings(operation.values.settings);
  // The privileged native launcher and durable ledger must reject the same
  // closed stage/extract wire as the unprivileged host, before any process or
  // journal effect. Historical legacy operations retain their original codec.
  const phase = operation.values.phase as { kind?: unknown } | null;
  if (!phase || typeof phase !== 'object' || Array.isArray(phase)
    || !['stage', 'extract'].includes(String(phase.kind))
    || Object.keys(phase).sort().join(',') !== (phase.kind === 'stage' ? 'kind' : 'input,kind')) {
    throw new Error('BUSTER_PREPARATION_PHASE_INVALID');
  }
  const settings = captureBusterPreparationV10(operation.values.settings);
  // The complete original author must agree with EVERY native execution arm.
  // A self-consistently rehashed envelope is not permission to replace profile,
  // resource grants, evidence limits or the original completion window.
  const profile = preparationProfile(envelope.profile.engine.contentDigest, 'v10');
  const limits = { timeoutMs: settings.timeoutMs, cleanupTimeoutMs: settings.cleanupTimeoutMs,
    logBytes: settings.attemptLogBytes, resultBytes: settings.maximumResultBytes,
    evidenceBytes: settings.attemptEvidenceBytes, evidenceFiles: settings.attemptEvidenceFiles };
  const budgets = { schemaVersion: 'worker-resource-budgets.v2',
    cpuTimeMs: { state: 'requested', limit: settings.resourcePolicy.cpuTimeMs },
    maximumMemoryBytes: { state: 'requested', limit: settings.resourcePolicy.memoryBytes },
    maximumTasks: { state: 'requested', limit: settings.resourcePolicy.tasks } };
  const completionWindow = settings.timeoutMs + settings.completionPhaseAllowance * settings.cleanupTimeoutMs;
  if (canonicalJson(envelope.profile) !== canonicalJson(profile)
    || canonicalJson(envelope.limits) !== canonicalJson(limits)
    || canonicalJson(envelope.resourceBudgets) !== canonicalJson(budgets)
    || Date.parse(envelope.queueDeadline) - Date.parse(envelope.issuedAt) !== completionWindow
    || Date.parse(envelope.claim.expiresAt) - Date.parse(envelope.issuedAt) !== completionWindow) {
    throw new Error('BUSTER_PREPARATION_OPERATION_POLICY_MISMATCH');
  }
  return settings;
}
