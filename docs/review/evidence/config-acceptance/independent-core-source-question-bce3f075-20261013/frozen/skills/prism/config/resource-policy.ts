import type { WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { PrismResourcePolicy } from '../../common/plugin-runtime/foundation/config/swarm.ts';

/** Cumulative CPU time is not comparable to the pool's CPU quota/rate. */
export function requirePrismResourcePoolCapacity(policy: PrismResourcePolicy, pool: { memoryBytes: number; tasks: number }): void {
  for (const metric of ['memoryBytes', 'tasks'] as const) {
    if (policy[metric] > pool[metric]) throw new Error(`PRISM_NATIVE_POLICY_EXCEEDS_POOL:${metric}`);
  }
}

/** Admit new budgets against the startup policy; preserve already accepted identities. */
export function prismAttemptResourceLimits(envelope: WorkerAttemptEnvelopeV3, policy: PrismResourcePolicy, recovered: boolean) {
  const requested = (metric: 'cpuTimeMs' | 'maximumMemoryBytes' | 'maximumTasks', maximum: number) => {
    const budget = envelope.resourceBudgets[metric];
    if (budget.state !== 'requested' || (!recovered && budget.limit > maximum)) throw new Error(`PRISM_NATIVE_BUDGET_NOT_ACCEPTED:${metric}`);
    return budget.limit;
  };
  return { cpuTimeMs: requested('cpuTimeMs', policy.cpuTimeMs),
    memoryBytes: requested('maximumMemoryBytes', policy.memoryBytes), tasks: requested('maximumTasks', policy.tasks) };
}
