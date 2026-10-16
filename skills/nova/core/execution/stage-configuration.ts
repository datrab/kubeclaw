import type { CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
/** Task deadlines override the selected installation default. The policy is
 * captured in the original runtime snapshot; this function performs no I/O and
 * does not rewrite the task graph or its identity. */
export function selectedStageConfiguration(type: string, config: Readonly<Record<string, unknown>>, approvalTimeoutMinutes?: number, prismDesignBudgets?: CoreRuntimePolicy['prismDesignBudgets']): Readonly<Record<string, unknown>> {
  if (type === 'kubeclaw.design.prism') {
    if (Object.hasOwn(config, 'budgets')) throw new Error('CORE_PRISM_BUDGET_DUPLICATE_AUTHOR');
    if (!prismDesignBudgets || Object.values(prismDesignBudgets).some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error('CORE_PRISM_BUDGET_REQUIRED');
    return Object.freeze({...config, budgets: Object.freeze({...prismDesignBudgets})});
  }
  if (!['kubeclaw.decision.human-approval', 'kubeclaw.decision.architecture-approval'].includes(type) || Object.hasOwn(config, 'timeoutMinutes')) return config;
  if (!Number.isSafeInteger(approvalTimeoutMinutes) || approvalTimeoutMinutes! < 1 || approvalTimeoutMinutes! > 525600) throw new Error('CORE_APPROVAL_TIMEOUT_REQUIRED');
  return Object.freeze({...config, timeoutMinutes: approvalTimeoutMinutes});
}
