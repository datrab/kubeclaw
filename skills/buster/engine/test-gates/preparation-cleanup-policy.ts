import { canonicalJson, validateWorkerResourceContractV3,
  type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { captureBusterPreparationV10 } from '@kubeclaw/plugin-foundation/config/buster-preparation-v10';
import { preparationCleanupProfile } from './preparation-cleanup-envelope.ts';

/** The retained cleanup profile selects its codec, never current settings or key presence.
 * This checks execution policy only, not original source or cleanup authority.
 */
export function preparationCleanupPolicy(envelope: WorkerAttemptEnvelopeV3, value: unknown) {
  validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
  const version = envelope.profile.profileId === 'buster-native-source-cleanup-v2' ? 'v10'
    : envelope.profile.profileId === 'buster-native-source-cleanup-v1' ? 'legacy' : null;
  if (version === null) throw new Error('BUSTER_PREPARATION_CLEANUP_PROFILE_INVALID');
  const captured = version === 'v10' ? captureBusterPreparationV10(value) : null;
  const settings = captured ?? validateBusterPreparationSettings(value);
  const timeoutMs = settings.timeoutMs + (captured ? captured.completionPhaseAllowance : 8) * settings.cleanupTimeoutMs;
  if (captured) {
    const profile = preparationCleanupProfile(envelope.profile.engine.contentDigest, 'v10');
    const limits = { timeoutMs: captured.timeoutMs, cleanupTimeoutMs: captured.cleanupTimeoutMs,
      logBytes: captured.attemptLogBytes, resultBytes: captured.maximumResultBytes,
      evidenceBytes: captured.attemptEvidenceBytes, evidenceFiles: captured.attemptEvidenceFiles };
    const budgets = { schemaVersion: 'worker-resource-budgets.v2',
      cpuTimeMs: { state: 'requested', limit: captured.resourcePolicy.cpuTimeMs },
      maximumMemoryBytes: { state: 'requested', limit: captured.resourcePolicy.memoryBytes },
      maximumTasks: { state: 'requested', limit: captured.resourcePolicy.tasks } };
    if (canonicalJson(envelope.profile) !== canonicalJson(profile)
      || canonicalJson(envelope.limits) !== canonicalJson(limits)
      || canonicalJson(envelope.resourceBudgets) !== canonicalJson(budgets)
      || Date.parse(envelope.queueDeadline) - Date.parse(envelope.issuedAt) !== timeoutMs
      || Date.parse(envelope.claim.expiresAt) - Date.parse(envelope.issuedAt) !== timeoutMs) {
      throw new Error('BUSTER_PREPARATION_CLEANUP_POLICY_MISMATCH');
    }
  }
  if (envelope.operation.contractId !== 'kubeclaw.native-source-cleanup@1') {
    throw new Error('BUSTER_PREPARATION_CLEANUP_ASSOCIATION_INVALID');
  }
  return { settings, limits: { cpuTimeMs: settings.resourcePolicy.cpuTimeMs,
    memoryBytes: settings.resourcePolicy.memoryBytes, tasks: settings.resourcePolicy.tasks, timeoutMs,
    maximumInputBytes: settings.maximumInputBytes, maximumOutputBytes: settings.maximumOutputBytes,
    pollIntervalMs: settings.pollIntervalMs, closeTimeoutMs: settings.closeTimeoutMs } };
}
