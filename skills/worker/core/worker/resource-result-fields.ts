import type { WorkerAttemptEnvelope, WorkerNativeResourceAccounting, WorkerResourceAccounting } from '@kubeclaw/pipeline-worker-core-contract';

/** Keep the accepted discriminator and its matching policy together in terminal receipts. */
export function resourceResultFields(envelope: WorkerAttemptEnvelope,
  accounting: WorkerResourceAccounting | WorkerNativeResourceAccounting | undefined) {
  if (envelope.schemaVersion === 'worker-attempt-envelope.v1') return { schemaVersion: 'worker-attempt-result.v1' as const };
  const identity = { profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest };
  if (envelope.schemaVersion === 'worker-attempt-envelope.v3') {
    if (accounting?.schemaVersion !== 'worker-resource-accounting.v2') throw new Error('WORKER_NATIVE_ACCOUNTING_POLICY_MISSING');
    return { ...identity, schemaVersion: 'worker-attempt-result.v3' as const, resourceAccounting: structuredClone(accounting) };
  }
  if (accounting?.schemaVersion !== 'worker-resource-accounting.v1') throw new Error('WORKER_ACCOUNTING_POLICY_MISSING');
  return { ...identity, schemaVersion: 'worker-attempt-result.v2' as const, resourceAccounting: structuredClone(accounting) };
}
